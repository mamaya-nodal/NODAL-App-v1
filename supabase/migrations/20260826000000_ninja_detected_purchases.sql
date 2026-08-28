-- Registro seguro de compras detectadas por el conector local de Ninja.

create table public.ninja_account_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.accounts (id) on delete restrict,
  machine_id text not null,
  connection_name text not null,
  external_account_name text not null,
  first_seen_at timestamptz not null,
  linked_by uuid not null references auth.users (id) on delete restrict,
  linked_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint ninja_account_links_names_present check (
    length(btrim(machine_id)) > 0 and length(btrim(connection_name)) > 0 and length(btrim(external_account_name)) > 0
  )
);

create unique index ninja_account_links_active_external_unique
on public.ninja_account_links (machine_id, connection_name, external_account_name)
where closed_at is null;

alter table public.ninja_account_links enable row level security;

create policy ninja_account_links_read_own
on public.ninja_account_links for select to authenticated
using (
  exists (
    select 1 from public.accounts accounts
    join public.periods periods on periods.id = accounts.period_id
    join public.workspaces spaces on spaces.id = periods.workspace_id
    where accounts.id = ninja_account_links.account_id
      and spaces.owner_user_id = auth.uid()
  )
);

grant select on public.ninja_account_links to authenticated;

create function public.create_nodal_detected_purchase(
  target_period_id uuid,
  target_company_id uuid,
  target_price_cents bigint,
  target_funds_origin public.purchase_funds_origin,
  target_purchased_on date,
  target_machine_id text,
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
  actor_id uuid := auth.uid();
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
  if nullif(btrim(target_machine_id), '') is null or nullif(btrim(target_connection_name), '') is null
    or nullif(btrim(target_external_account_name), '') is null then raise exception 'Invalid Ninja identity'; end if;

  select periods.period_month into selected_period_month
  from public.periods periods
  join public.workspaces spaces on spaces.id = periods.workspace_id
  join public.nodal_users users on users.id = spaces.owner_user_id
  where periods.id = target_period_id and spaces.owner_user_id = actor_id and users.access_state = 'active'
  for update of periods;
  if not found then raise exception 'The selected period is not available to this user'; end if;
  if date_trunc('month', target_purchased_on)::date <> selected_period_month then raise exception 'Purchase date must belong to selected period'; end if;

  if exists (select 1 from public.ninja_account_links links where links.machine_id = target_machine_id
    and links.connection_name = target_connection_name and links.external_account_name = target_external_account_name
    and links.closed_at is null) then raise exception 'Ninja account already linked'; end if;

  if not exists (select 1 from public.companies companies where companies.id = target_company_id and companies.is_active) then
    raise exception 'Company is not available';
  end if;

  select coalesce(max(purchases.purchase_number), 0) + 1 into next_purchase_number
  from public.purchases purchases where purchases.period_id = target_period_id;
  select coalesce(max(accounts.reference_number), 0) + 1 into next_reference_number
  from public.accounts accounts where accounts.period_id = target_period_id and accounts.company_id = target_company_id;

  insert into public.accounts (period_id, company_id, reference_number, state, created_by)
  values (target_period_id, target_company_id, next_reference_number, 'virgin', actor_id)
  returning id into new_account_id;

  insert into public.purchases (period_id, account_id, purchase_number, purchased_on, price_cents, funds_origin, created_by)
  values (target_period_id, new_account_id, next_purchase_number, target_purchased_on, target_price_cents, target_funds_origin, actor_id)
  returning id into new_purchase_id;

  insert into public.ninja_account_links (account_id, machine_id, connection_name, external_account_name, first_seen_at, linked_by)
  values (new_account_id, target_machine_id, target_connection_name, target_external_account_name, target_first_seen_at, actor_id);

  insert into public.audit_events (actor_user_id, entity_table, entity_id, action, current_data, reason)
  values (actor_id, 'purchases', new_purchase_id, 'detected_purchase_created', jsonb_build_object(
    'account_id', new_account_id, 'external_account_name', target_external_account_name,
    'connection_name', target_connection_name, 'purchased_on', target_purchased_on,
    'price_cents', target_price_cents, 'funds_origin', target_funds_origin
  ), 'Compra detectada en Ninja y confirmada por el usuario');

  return new_purchase_id;
end;
$$;

revoke all on function public.create_nodal_detected_purchase(uuid, uuid, bigint, public.purchase_funds_origin, date, text, text, text, timestamptz) from public, anon;
grant execute on function public.create_nodal_detected_purchase(uuid, uuid, bigint, public.purchase_funds_origin, date, text, text, text, timestamptz) to authenticated;
