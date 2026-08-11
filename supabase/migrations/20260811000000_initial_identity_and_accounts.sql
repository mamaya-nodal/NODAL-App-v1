-- NODAL App: identidad, aislamiento, periodos, cuentas y compras iniciales.
-- No contiene datos personales ni secretos.

create type public.nodal_access_state as enum ('pending', 'active', 'revoked');
create type public.nodal_modality as enum ('real', 'practice');
create type public.account_state as enum ('virgin', 'live', 'closed');
create type public.purchase_funds_origin as enum ('Aporte trader', 'Saldo generado');

create table public.nodal_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  access_state public.nodal_access_state not null default 'pending',
  authorized_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nodal_users_email_normalized check (email = lower(email)),
  constraint nodal_users_authorization_dates check (
    (access_state = 'active' and authorized_at is not null and revoked_at is null)
    or (access_state = 'revoked' and revoked_at is not null)
    or (access_state = 'pending' and authorized_at is null and revoked_at is null)
  )
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.nodal_users (id) on delete restrict,
  modality public.nodal_modality not null,
  created_at timestamptz not null default now(),
  unique (owner_user_id, modality)
);

create table public.periods (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  period_month date not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, period_month),
  constraint periods_month_starts_on_day_one check (
    period_month = date_trunc('month', period_month)::date
  )
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  is_active boolean not null default true,
  valid_from date,
  valid_until date,
  created_at timestamptz not null default now(),
  constraint companies_code_format check (code = upper(code)),
  constraint companies_validity check (
    valid_until is null or valid_from is null or valid_until >= valid_from
  )
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete restrict,
  reference_number integer not null,
  state public.account_state not null default 'virgin',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (period_id, company_id, reference_number),
  unique (id, period_id),
  constraint accounts_reference_positive check (reference_number > 0)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods (id) on delete restrict,
  account_id uuid not null,
  purchase_number integer not null,
  purchased_on date not null,
  price_cents bigint not null,
  funds_origin public.purchase_funds_origin not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (period_id, purchase_number),
  unique (account_id),
  foreign key (account_id, period_id)
    references public.accounts (id, period_id) on delete restrict,
  constraint purchases_number_positive check (purchase_number > 0),
  constraint purchases_price_nonnegative check (price_cents >= 0)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  entity_table text not null,
  entity_id uuid not null,
  action text not null,
  previous_data jsonb,
  current_data jsonb,
  reason text,
  occurred_at timestamptz not null default now(),
  constraint audit_events_action_present check (btrim(action) <> ''),
  constraint audit_events_entity_present check (btrim(entity_table) <> '')
);

create index workspaces_owner_user_id_idx on public.workspaces (owner_user_id);
create index periods_workspace_id_idx on public.periods (workspace_id);
create index accounts_period_id_idx on public.accounts (period_id);
create index accounts_company_id_idx on public.accounts (company_id);
create index purchases_period_id_idx on public.purchases (period_id);
create index purchases_created_by_idx on public.purchases (created_by);
create index audit_events_entity_idx on public.audit_events (entity_table, entity_id);
create index audit_events_actor_idx on public.audit_events (actor_user_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger nodal_users_set_updated_at
before update on public.nodal_users
for each row execute function public.set_updated_at();

create trigger accounts_set_updated_at
before update on public.accounts
for each row execute function public.set_updated_at();

create trigger purchases_set_updated_at
before update on public.purchases
for each row execute function public.set_updated_at();

create function public.is_current_user_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nodal_users as users
    where users.id = (select auth.uid())
      and users.access_state = 'active'
  );
$$;

create function public.can_access_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_current_user_active()
    and exists (
      select 1
      from public.workspaces as spaces
      where spaces.id = target_workspace_id
        and spaces.owner_user_id = (select auth.uid())
    );
$$;

create function public.can_access_period(target_period_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.periods as p
    where p.id = target_period_id
      and public.can_access_workspace(p.workspace_id)
  );
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.is_current_user_active() from public, anon;
revoke all on function public.can_access_workspace(uuid) from public, anon;
revoke all on function public.can_access_period(uuid) from public, anon;
grant execute on function public.is_current_user_active() to authenticated;
grant execute on function public.can_access_workspace(uuid) to authenticated;
grant execute on function public.can_access_period(uuid) to authenticated;

alter table public.nodal_users enable row level security;
alter table public.workspaces enable row level security;
alter table public.periods enable row level security;
alter table public.companies enable row level security;
alter table public.accounts enable row level security;
alter table public.purchases enable row level security;
alter table public.audit_events enable row level security;

create policy nodal_users_read_own_access
on public.nodal_users for select to authenticated
using (id = (select auth.uid()));

create policy workspaces_read_own
on public.workspaces for select to authenticated
using (public.can_access_workspace(id));

create policy periods_read_own
on public.periods for select to authenticated
using (public.can_access_workspace(workspace_id));

create policy companies_read_when_authorized
on public.companies for select to authenticated
using (public.is_current_user_active());

create policy accounts_read_own
on public.accounts for select to authenticated
using (public.can_access_period(period_id));

create policy purchases_read_own
on public.purchases for select to authenticated
using (public.can_access_period(period_id));

revoke all on table public.nodal_users from anon;
revoke all on table public.workspaces from anon;
revoke all on table public.periods from anon;
revoke all on table public.companies from anon;
revoke all on table public.accounts from anon;
revoke all on table public.purchases from anon;
revoke all on table public.audit_events from anon;

revoke insert, update, delete on table public.nodal_users from authenticated;
revoke insert, update, delete on table public.workspaces from authenticated;
revoke insert, update, delete on table public.periods from authenticated;
revoke insert, update, delete on table public.companies from authenticated;
revoke insert, update, delete on table public.accounts from authenticated;
revoke insert, update, delete on table public.purchases from authenticated;
revoke all on table public.audit_events from authenticated;

grant select on table public.nodal_users to authenticated;
grant select on table public.workspaces to authenticated;
grant select on table public.periods to authenticated;
grant select on table public.companies to authenticated;
grant select on table public.accounts to authenticated;
grant select on table public.purchases to authenticated;

insert into public.companies (code, display_name)
values
  ('FFF', 'FFF'),
  ('LUCID', 'LUCID'),
  ('TRADEFY', 'TRADEFY');
