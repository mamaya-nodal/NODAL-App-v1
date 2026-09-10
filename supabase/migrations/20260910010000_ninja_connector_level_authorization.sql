-- La autorización pertenece al usuario/conector vinculado. Las conexiones
-- internas que NinjaTrader descubra quedan activas por defecto; una revisión
-- sólo se conserva como excepción explícita para aislar una conexión.

create or replace function public.get_current_user_ninja_inventory()
returns table(connector_id uuid, observed_at timestamptz, accounts jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with current_connector as (
    select connectors.id
    from public.ninja_connectors connectors
    where connectors.owner_user_id = (select auth.uid())
      and connectors.status = 'active'
      and public.is_current_user_active()
  ), latest as (
    select distinct on (snapshots.connector_id)
      snapshots.connector_id, snapshots.observed_at, snapshots.accounts
    from public.ninja_inventory_snapshots snapshots
    join current_connector on current_connector.id = snapshots.connector_id
    order by snapshots.connector_id, snapshots.observed_at desc
  )
  select latest.connector_id, latest.observed_at,
    coalesce((
      select jsonb_agg(account || jsonb_build_object('firstSeenAt', (
        select min(history.observed_at)
        from public.ninja_inventory_snapshots history,
             jsonb_array_elements(history.accounts) historical_account
        where history.connector_id = latest.connector_id
          and historical_account->>'connectionName' = account->>'connectionName'
          and historical_account->>'accountName' = account->>'accountName'
      )))
      from jsonb_array_elements(latest.accounts) account
      where not exists (
        select 1
        from public.ninja_connector_connection_reviews reviews
        where reviews.connector_id = latest.connector_id
          and reviews.connection_name = account->>'connectionName'
          and reviews.status = 'isolated'
      )
    ), '[]'::jsonb)
  from latest;
$$;

create or replace function public.create_nodal_detected_purchase(
  target_period_id uuid,
  target_company_id uuid,
  target_price_cents bigint,
  target_funds_origin public.purchase_funds_origin,
  target_purchased_on date,
  target_connector_id uuid,
  target_connection_name text,
  target_external_account_name text,
  target_first_seen_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_period_month date;
  business_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  next_purchase_number integer;
  next_reference_number integer;
  new_account_id uuid;
  new_purchase_id uuid;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;
  if target_price_cents is null or target_price_cents < 0 then raise exception 'Invalid purchase price'; end if;
  if target_purchased_on is null or target_purchased_on > business_today then raise exception 'Invalid purchase date'; end if;
  if target_connector_id is null or nullif(btrim(target_connection_name), '') is null
    or nullif(btrim(target_external_account_name), '') is null then raise exception 'Invalid Ninja identity'; end if;

  select periods.period_month into selected_period_month
  from public.periods periods
  join public.workspaces spaces on spaces.id = periods.workspace_id
  join public.nodal_users users on users.id = spaces.owner_user_id
  where periods.id = target_period_id and spaces.owner_user_id = actor_id and users.access_state = 'active'
  for update of periods;
  if not found then raise exception 'The selected period is not available to this user'; end if;
  if date_trunc('month', target_purchased_on)::date <> selected_period_month then raise exception 'Purchase date must belong to selected period'; end if;
  if not exists (
    select 1 from public.ninja_connectors connectors
    where connectors.id = target_connector_id
      and connectors.owner_user_id = actor_id
      and connectors.status = 'active'
  ) then raise exception 'Connector is not active for this user'; end if;
  if exists (
    select 1 from public.ninja_connector_connection_reviews reviews
    where reviews.connector_id = target_connector_id
      and reviews.connection_name = btrim(target_connection_name)
      and reviews.status = 'isolated'
  ) then raise exception 'Ninja connection is isolated for this user'; end if;
  if not exists (
    select 1
    from public.ninja_inventory_snapshots snapshots,
         jsonb_array_elements(snapshots.accounts) account
    where snapshots.connector_id = target_connector_id
      and account->>'connectionName' = btrim(target_connection_name)
      and account->>'accountName' = btrim(target_external_account_name)
  ) then raise exception 'Ninja account was not observed for this user'; end if;
  if exists (
    select 1 from public.ninja_account_links links
    where links.connector_id = target_connector_id
      and links.connection_name = btrim(target_connection_name)
      and links.external_account_name = btrim(target_external_account_name)
      and links.closed_at is null
  ) then raise exception 'Ninja account already linked'; end if;
  if not exists (select 1 from public.companies companies where companies.id = target_company_id and companies.is_active) then
    raise exception 'Company is not available';
  end if;

  select coalesce(max(purchases.purchase_number), 0) + 1 into next_purchase_number
  from public.purchases purchases where purchases.period_id = target_period_id;
  select coalesce(max(accounts.reference_number), 0) + 1 into next_reference_number
  from public.accounts accounts where accounts.period_id = target_period_id and accounts.company_id = target_company_id;

  insert into public.accounts(period_id, company_id, reference_number, state, created_by)
  values (target_period_id, target_company_id, next_reference_number, 'virgin', actor_id)
  returning id into new_account_id;
  insert into public.purchases(period_id, account_id, purchase_number, purchased_on, price_cents, funds_origin, created_by)
  values (target_period_id, new_account_id, next_purchase_number, target_purchased_on, target_price_cents, target_funds_origin, actor_id)
  returning id into new_purchase_id;
  insert into public.ninja_account_links(account_id, connector_id, connection_name, external_account_name, first_seen_at, linked_by)
  values (new_account_id, target_connector_id, btrim(target_connection_name), btrim(target_external_account_name), target_first_seen_at, actor_id);
  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values (actor_id, 'purchases', new_purchase_id, 'detected_purchase_created', jsonb_build_object(
    'account_id', new_account_id,
    'external_account_name', btrim(target_external_account_name),
    'connection_name', btrim(target_connection_name),
    'purchased_on', target_purchased_on,
    'price_cents', target_price_cents,
    'funds_origin', target_funds_origin
  ), 'Compra detectada en Ninja y confirmada por el usuario');
  return new_purchase_id;
end;
$$;

create or replace function public.enforce_approved_ninja_account_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.connector_id is not null then
    if not exists (
      select 1
      from public.ninja_connectors connectors
      where connectors.id = new.connector_id
        and connectors.owner_user_id = new.linked_by
        and connectors.status = 'active'
        and not exists (
          select 1
          from public.ninja_connector_connection_reviews reviews
          where reviews.connector_id = connectors.id
            and reviews.connection_name = new.connection_name
            and reviews.status = 'isolated'
        )
    ) then raise exception 'Ninja connector is not active for this user or the connection is isolated'; end if;
  elsif not exists (
    select 1
    from public.ninja_machine_assignments assignments
    join public.ninja_connection_reviews reviews
      on reviews.machine_id = assignments.machine_id
     and reviews.connection_name = new.connection_name
     and reviews.status = 'approved'
    where assignments.machine_id = new.machine_id
      and assignments.owner_user_id = new.linked_by
  ) then raise exception 'Ninja connection is not approved for this user'; end if;
  return new;
end;
$$;

comment on table public.ninja_connector_connection_reviews is
  'Excepciones administrativas por conexión interna. Sin fila o con approved, la conexión está activa; isolated la excluye.';
