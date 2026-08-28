-- Vinculacion del conector Ninja con el usuario NODAL mediante codigo temporal.
-- Reemplaza la asignacion principal por Machine ID sin borrar el historial tecnico anterior.

create table public.ninja_connectors (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.nodal_users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'revoked')),
  connector_version text not null,
  access_token_hash text not null unique,
  access_expires_at timestamptz not null,
  refresh_token_hash text not null unique,
  refresh_expires_at timestamptz not null,
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ninja_connector_version_present check (length(btrim(connector_version)) > 0),
  constraint ninja_connector_status_dates check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

create unique index ninja_connectors_one_active_per_user
on public.ninja_connectors(owner_user_id)
where status = 'active';

create index ninja_connectors_last_seen_idx
on public.ninja_connectors(last_seen_at desc);

create trigger ninja_connectors_set_updated_at
before update on public.ninja_connectors
for each row execute function public.set_updated_at();

create table public.ninja_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.nodal_users(id) on delete restrict,
  code_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_connector_id uuid references public.ninja_connectors(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint ninja_pairing_code_hash_present check (length(code_hash) = 64),
  constraint ninja_pairing_code_consumption_complete check (
    (consumed_at is null and consumed_by_connector_id is null)
    or (consumed_at is not null and consumed_by_connector_id is not null)
  )
);

create index ninja_pairing_codes_owner_created_idx
on public.ninja_pairing_codes(owner_user_id, created_at desc);

alter table public.ninja_connectors enable row level security;
alter table public.ninja_pairing_codes enable row level security;
revoke all on table public.ninja_connectors from public, anon, authenticated;
revoke all on table public.ninja_pairing_codes from public, anon, authenticated;

create function public.create_ninja_pairing_code(
  target_code_hash text,
  target_expires_at timestamptz
)
returns table(pairing_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  new_pairing_id uuid;
begin
  if actor_id is null or not public.is_current_user_active() then
    raise exception 'Not authorized';
  end if;
  if target_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid pairing code hash';
  end if;
  if target_expires_at <= now() or target_expires_at > now() + interval '10 minutes' then
    raise exception 'Invalid pairing expiration';
  end if;

  update public.ninja_pairing_codes codes
  set expires_at = now()
  where codes.owner_user_id = actor_id
    and codes.consumed_at is null
    and codes.expires_at > now();

  insert into public.ninja_pairing_codes(owner_user_id, code_hash, expires_at)
  values (actor_id, target_code_hash, target_expires_at)
  returning id into new_pairing_id;

  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values (
    actor_id,
    'ninja_pairing_codes',
    new_pairing_id,
    'ninja_pairing_code_created',
    jsonb_build_object('expires_at', target_expires_at),
    'Codigo temporal solicitado por el usuario'
  );

  return query select new_pairing_id, target_expires_at;
end;
$$;

create function public.redeem_ninja_pairing_code(
  target_code_hash text,
  target_connector_version text,
  target_access_token_hash text,
  target_access_expires_at timestamptz,
  target_refresh_token_hash text,
  target_refresh_expires_at timestamptz
)
returns table(connector_id uuid, owner_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_code public.ninja_pairing_codes%rowtype;
  new_connector_id uuid;
begin
  select * into selected_code
  from public.ninja_pairing_codes codes
  where codes.code_hash = target_code_hash
    and codes.consumed_at is null
    and codes.expires_at > now()
  for update;

  if not found then raise exception 'Pairing code is invalid or expired'; end if;
  if not exists (
    select 1 from public.nodal_users users
    where users.id = selected_code.owner_user_id and users.access_state = 'active'
  ) then raise exception 'NODAL user is not active'; end if;
  if nullif(btrim(target_connector_version), '') is null then raise exception 'Connector version is required'; end if;
  if target_access_token_hash !~ '^[0-9a-f]{64}$' or target_refresh_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid connector credential';
  end if;
  if target_access_expires_at <= now() or target_access_expires_at > now() + interval '20 minutes' then
    raise exception 'Invalid access expiration';
  end if;
  if target_refresh_expires_at <= now() + interval '1 day' or target_refresh_expires_at > now() + interval '95 days' then
    raise exception 'Invalid refresh expiration';
  end if;

  update public.ninja_connectors connectors
  set status = 'revoked', revoked_at = now()
  where connectors.owner_user_id = selected_code.owner_user_id
    and connectors.status = 'active';

  insert into public.ninja_connectors(
    owner_user_id,
    connector_version,
    access_token_hash,
    access_expires_at,
    refresh_token_hash,
    refresh_expires_at
  ) values (
    selected_code.owner_user_id,
    btrim(target_connector_version),
    target_access_token_hash,
    target_access_expires_at,
    target_refresh_token_hash,
    target_refresh_expires_at
  ) returning id into new_connector_id;

  update public.ninja_pairing_codes codes
  set consumed_at = now(), consumed_by_connector_id = new_connector_id
  where codes.id = selected_code.id;

  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values (
    selected_code.owner_user_id,
    'ninja_connectors',
    new_connector_id,
    'ninja_connector_paired',
    jsonb_build_object('connector_version', btrim(target_connector_version)),
    'Vinculacion confirmada mediante codigo temporal'
  );

  return query select new_connector_id, selected_code.owner_user_id;
end;
$$;

create function public.refresh_ninja_connector_session(
  target_refresh_token_hash text,
  target_access_token_hash text,
  target_access_expires_at timestamptz,
  target_new_refresh_token_hash text,
  target_refresh_expires_at timestamptz
)
returns table(connector_id uuid, owner_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_connector public.ninja_connectors%rowtype;
begin
  select connectors.* into selected_connector
  from public.ninja_connectors connectors
  join public.nodal_users users on users.id = connectors.owner_user_id
  where connectors.refresh_token_hash = target_refresh_token_hash
    and connectors.refresh_expires_at > now()
    and connectors.status = 'active'
    and users.access_state = 'active'
  for update of connectors;

  if not found then raise exception 'Connector refresh is invalid or expired'; end if;

  update public.ninja_connectors connectors
  set access_token_hash = target_access_token_hash,
      access_expires_at = target_access_expires_at,
      refresh_token_hash = target_new_refresh_token_hash,
      refresh_expires_at = target_refresh_expires_at
  where connectors.id = selected_connector.id;

  return query select selected_connector.id, selected_connector.owner_user_id;
end;
$$;

create function public.authenticate_ninja_connector_access(target_access_token_hash text)
returns table(connector_id uuid, owner_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_connector public.ninja_connectors%rowtype;
begin
  select connectors.* into selected_connector
  from public.ninja_connectors connectors
  join public.nodal_users users on users.id = connectors.owner_user_id
  where connectors.access_token_hash = target_access_token_hash
    and connectors.access_expires_at > now()
    and connectors.status = 'active'
    and users.access_state = 'active'
  for update of connectors;

  if not found then return; end if;

  update public.ninja_connectors connectors
  set last_seen_at = now()
  where connectors.id = selected_connector.id;

  return query select selected_connector.id, selected_connector.owner_user_id;
end;
$$;

create function public.get_current_user_ninja_connector_status()
returns table(
  connector_id uuid,
  status text,
  connector_version text,
  paired_at timestamptz,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select connectors.id, connectors.status, connectors.connector_version,
         connectors.paired_at, connectors.last_seen_at
  from public.ninja_connectors connectors
  where connectors.owner_user_id = (select auth.uid())
    and connectors.status = 'active'
    and public.is_current_user_active()
  order by connectors.paired_at desc
  limit 1;
$$;

revoke all on function public.create_ninja_pairing_code(text, timestamptz) from public, anon;
revoke all on function public.redeem_ninja_pairing_code(text, text, text, timestamptz, text, timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_ninja_connector_session(text, text, timestamptz, text, timestamptz) from public, anon, authenticated;
revoke all on function public.authenticate_ninja_connector_access(text) from public, anon, authenticated;
revoke all on function public.get_current_user_ninja_connector_status() from public, anon;
grant execute on function public.create_ninja_pairing_code(text, timestamptz) to authenticated;
grant execute on function public.redeem_ninja_pairing_code(text, text, text, timestamptz, text, timestamptz) to service_role;
grant execute on function public.refresh_ninja_connector_session(text, text, timestamptz, text, timestamptz) to service_role;
grant execute on function public.authenticate_ninja_connector_access(text) to service_role;
grant execute on function public.get_current_user_ninja_connector_status() to authenticated;

create function public.revoke_current_ninja_connector(management_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_connector_id uuid;
begin
  if actor_id is null or not public.is_current_user_active() then raise exception 'Not authorized'; end if;
  if nullif(btrim(management_reason), '') is null then raise exception 'Reason is required'; end if;

  update public.ninja_connectors connectors
  set status = 'revoked', revoked_at = now()
  where connectors.owner_user_id = actor_id and connectors.status = 'active'
  returning connectors.id into selected_connector_id;

  if selected_connector_id is null then return false; end if;
  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, reason)
  values (actor_id, 'ninja_connectors', selected_connector_id, 'ninja_connector_revoked', btrim(management_reason));
  return true;
end;
$$;

revoke all on function public.revoke_current_ninja_connector(text) from public, anon;
grant execute on function public.revoke_current_ninja_connector(text) to authenticated;

-- Las instantaneas nuevas se atribuyen por la credencial del conector, no por un dato declarado en el payload.
alter table public.ninja_inventory_snapshots
  add column connector_id uuid references public.ninja_connectors(id) on delete restrict;
alter table public.ninja_inventory_snapshots alter column machine_id drop not null;
alter table public.ninja_inventory_snapshots drop constraint ninja_inventory_snapshot_machine_present;
alter table public.ninja_inventory_snapshots add constraint ninja_inventory_snapshot_identity_present check (
  connector_id is not null or nullif(btrim(machine_id), '') is not null
);
create index ninja_inventory_snapshots_connector_observed_idx
on public.ninja_inventory_snapshots(connector_id, observed_at desc);

create table public.ninja_connector_connection_reviews (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references public.ninja_connectors(id) on delete restrict,
  connection_name text not null,
  status text not null check (status in ('approved', 'isolated')),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  unique(connector_id, connection_name),
  constraint ninja_connector_connection_name_present check (length(btrim(connection_name)) > 0)
);

alter table public.ninja_connector_connection_reviews enable row level security;
revoke all on table public.ninja_connector_connection_reviews from public, anon, authenticated;

create function public.admin_list_ninja_connectors()
returns table(
  connector_id uuid,
  owner_user_id uuid,
  owner_email text,
  owner_display_name text,
  status text,
  connector_version text,
  paired_at timestamptz,
  last_seen_at timestamptz,
  account_count integer,
  connections text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with latest as (
    select distinct on (snapshots.connector_id)
      snapshots.connector_id, snapshots.account_count, snapshots.accounts
    from public.ninja_inventory_snapshots snapshots
    where snapshots.connector_id is not null
    order by snapshots.connector_id, snapshots.observed_at desc
  )
  select connectors.id, connectors.owner_user_id, users.email, users.display_name,
         connectors.status, connectors.connector_version, connectors.paired_at,
         connectors.last_seen_at, coalesce(latest.account_count, 0),
         coalesce((
           select array_agg(distinct account->>'connectionName' order by account->>'connectionName')
           from jsonb_array_elements(latest.accounts) account
           where nullif(btrim(account->>'connectionName'), '') is not null
         ), array[]::text[])
  from public.ninja_connectors connectors
  join public.nodal_users users on users.id = connectors.owner_user_id
  left join latest on latest.connector_id = connectors.id
  where public.is_current_user_admin()
  order by connectors.paired_at desc;
$$;

create function public.admin_list_ninja_connector_connections()
returns table(connector_id uuid, connection_name text, account_count bigint, review_status text)
language sql
stable
security definer
set search_path = ''
as $$
  with latest as (
    select distinct on (snapshots.connector_id) snapshots.connector_id, snapshots.accounts
    from public.ninja_inventory_snapshots snapshots
    where snapshots.connector_id is not null
    order by snapshots.connector_id, snapshots.observed_at desc
  ), observed as (
    select latest.connector_id, account->>'connectionName' connection_name, count(*) account_count
    from latest, jsonb_array_elements(latest.accounts) account
    where nullif(btrim(account->>'connectionName'), '') is not null
    group by latest.connector_id, account->>'connectionName'
  )
  select observed.connector_id, observed.connection_name, observed.account_count, reviews.status
  from observed
  left join public.ninja_connector_connection_reviews reviews
    on reviews.connector_id = observed.connector_id
   and reviews.connection_name = observed.connection_name
  where public.is_current_user_admin()
  order by observed.connector_id, observed.connection_name;
$$;

create function public.admin_review_ninja_connector_connection(
  target_connector_id uuid,
  target_connection_name text,
  target_status text,
  management_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  review_id uuid;
  previous_data jsonb;
  current_data jsonb;
begin
  if actor_id is null or not public.is_current_user_admin() then raise exception 'Not authorized'; end if;
  if target_status not in ('approved', 'isolated') or nullif(btrim(management_reason), '') is null then
    raise exception 'Invalid review';
  end if;
  if not exists (
    select 1
    from public.ninja_inventory_snapshots snapshots,
         jsonb_array_elements(snapshots.accounts) account
    where snapshots.connector_id = target_connector_id
      and account->>'connectionName' = btrim(target_connection_name)
  ) then raise exception 'Connection was not observed'; end if;

  select to_jsonb(reviews) into previous_data
  from public.ninja_connector_connection_reviews reviews
  where reviews.connector_id = target_connector_id
    and reviews.connection_name = btrim(target_connection_name);

  insert into public.ninja_connector_connection_reviews(connector_id, connection_name, status, reviewed_by)
  values (target_connector_id, btrim(target_connection_name), target_status, actor_id)
  on conflict(connector_id, connection_name) do update set
    status = excluded.status,
    reviewed_by = actor_id,
    reviewed_at = now()
  returning id into review_id;

  select to_jsonb(reviews) into current_data
  from public.ninja_connector_connection_reviews reviews where reviews.id = review_id;
  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason)
  values (actor_id, 'ninja_connector_connection_reviews', review_id, 'ninja_connection_reviewed', previous_data, current_data, btrim(management_reason));
  return review_id;
end;
$$;

revoke all on function public.admin_list_ninja_connectors() from public, anon;
revoke all on function public.admin_list_ninja_connector_connections() from public, anon;
revoke all on function public.admin_review_ninja_connector_connection(uuid, text, text, text) from public, anon;
grant execute on function public.admin_list_ninja_connectors() to authenticated;
grant execute on function public.admin_list_ninja_connector_connections() to authenticated;
grant execute on function public.admin_review_ninja_connector_connection(uuid, text, text, text) to authenticated;

drop function public.get_current_user_ninja_inventory();
create function public.get_current_user_ninja_inventory()
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
      join public.ninja_connector_connection_reviews reviews
        on reviews.connector_id = latest.connector_id
       and reviews.connection_name = account->>'connectionName'
       and reviews.status = 'approved'
    ), '[]'::jsonb)
  from latest;
$$;

revoke all on function public.get_current_user_ninja_inventory() from public, anon;
grant execute on function public.get_current_user_ninja_inventory() to authenticated;

-- Los enlaces economicos nuevos se atribuyen al conector autenticado.
alter table public.ninja_account_links
  add column connector_id uuid references public.ninja_connectors(id) on delete restrict;
alter table public.ninja_account_links alter column machine_id drop not null;
alter table public.ninja_account_links drop constraint ninja_account_links_names_present;
alter table public.ninja_account_links add constraint ninja_account_links_names_present check (
  (connector_id is not null or nullif(btrim(machine_id), '') is not null)
  and length(btrim(connection_name)) > 0
  and length(btrim(external_account_name)) > 0
);
create unique index ninja_account_links_active_connector_external_unique
on public.ninja_account_links(connector_id, connection_name, external_account_name)
where closed_at is null and connector_id is not null;

create function public.create_nodal_detected_purchase(
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
  if not exists (
    select 1 from public.ninja_connector_connection_reviews reviews
    where reviews.connector_id = target_connector_id
      and reviews.connection_name = btrim(target_connection_name)
      and reviews.status = 'approved'
  ) then raise exception 'Ninja connection is not approved for this user'; end if;
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

revoke all on function public.create_nodal_detected_purchase(uuid, uuid, bigint, public.purchase_funds_origin, date, uuid, text, text, timestamptz) from public, anon;
grant execute on function public.create_nodal_detected_purchase(uuid, uuid, bigint, public.purchase_funds_origin, date, uuid, text, text, timestamptz) to authenticated;

-- Cierra los caminos del prototipo anterior basados en Machine ID. Las tablas
-- históricas se preservan, pero ninguna escritura nueva puede usarlas.
drop function public.create_nodal_detected_purchase(uuid, uuid, bigint, public.purchase_funds_origin, date, text, text, text, timestamptz);
revoke all on function public.admin_list_ninja_machines() from authenticated;
revoke all on function public.admin_assign_ninja_machine(text, uuid, text) from authenticated;
revoke all on function public.admin_list_ninja_connections() from authenticated;
revoke all on function public.admin_review_ninja_connection(text, text, text, text) from authenticated;

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
      join public.ninja_connector_connection_reviews reviews
        on reviews.connector_id = connectors.id
       and reviews.connection_name = new.connection_name
       and reviews.status = 'approved'
      where connectors.id = new.connector_id
        and connectors.owner_user_id = new.linked_by
        and connectors.status = 'active'
    ) then raise exception 'Ninja connection is not approved for this user'; end if;
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
