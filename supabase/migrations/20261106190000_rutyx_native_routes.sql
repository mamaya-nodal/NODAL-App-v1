-- RUTYX nativo: habilitaciones por usuario, estado actual y eventos auditables.
-- El catálogo confidencial de rutas permanece en el servidor de la aplicación.

create table public.rutyx_route_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.nodal_users(id) on delete cascade,
  company_code text not null,
  strategy_id text not null,
  strategy_name text not null,
  enabled boolean not null default true,
  granted_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, strategy_id),
  constraint rutyx_entitlement_company_valid check (company_code in ('LUCID','FTMO','TRADEIFY')),
  constraint rutyx_entitlement_strategy_present check (nullif(btrim(strategy_id), '') is not null),
  constraint rutyx_entitlement_name_present check (nullif(btrim(strategy_name), '') is not null)
);

create table public.rutyx_route_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.nodal_users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  strategy_id text not null,
  context_id text not null,
  phase text not null,
  node_id text not null,
  funding_account_count integer not null,
  coverage_contracts_per_account numeric(12,4) not null,
  route_contracts_per_account numeric(12,4) not null,
  broker_ratio numeric(16,6) not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, account_id),
  constraint rutyx_state_phase_valid check (phase in ('eval','funded')),
  constraint rutyx_state_counts_valid check (
    funding_account_count > 0
    and coverage_contracts_per_account > 0
    and route_contracts_per_account > 0
    and broker_ratio < 0
  )
);

create table public.rutyx_route_events (
  id uuid primary key default gen_random_uuid(),
  route_state_id uuid not null references public.rutyx_route_states(id) on delete restrict,
  user_id uuid not null references public.nodal_users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  event_type text not null,
  outcome text,
  from_node_id text,
  to_node_id text not null,
  broker_ratio numeric(16,6) not null,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint rutyx_event_type_valid check (event_type in ('started','result')),
  constraint rutyx_event_outcome_valid check (
    (event_type = 'started' and outcome is null and from_node_id is null)
    or (event_type = 'result' and outcome in ('TP','SL') and from_node_id is not null)
  )
);

create index rutyx_route_entitlements_user_idx on public.rutyx_route_entitlements(user_id, enabled);
create index rutyx_route_events_state_idx on public.rutyx_route_events(route_state_id, created_at desc);

create trigger rutyx_route_entitlements_set_updated_at
before update on public.rutyx_route_entitlements
for each row execute function public.set_updated_at();

create trigger rutyx_route_states_set_updated_at
before update on public.rutyx_route_states
for each row execute function public.set_updated_at();

alter table public.rutyx_route_entitlements enable row level security;
alter table public.rutyx_route_states enable row level security;
alter table public.rutyx_route_events enable row level security;

create policy rutyx_entitlements_read_own on public.rutyx_route_entitlements
for select to authenticated using (user_id = (select auth.uid()));
create policy rutyx_states_read_own on public.rutyx_route_states
for select to authenticated using (user_id = (select auth.uid()));
create policy rutyx_events_read_own on public.rutyx_route_events
for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.rutyx_route_entitlements from anon, authenticated;
revoke all on table public.rutyx_route_states from anon, authenticated;
revoke all on table public.rutyx_route_events from anon, authenticated;
grant select on table public.rutyx_route_entitlements to authenticated;
grant select on table public.rutyx_route_states to authenticated;
grant select on table public.rutyx_route_events to authenticated;

-- Habilitación inicial del piloto. El despliegue general se controla desde Admin Master.
insert into public.rutyx_route_entitlements(user_id, company_code, strategy_id, strategy_name, granted_by)
select users.id, 'LUCID', strategy.id, strategy.name, users.id
from public.nodal_users users
cross join (values
  ('lucid_8bde56980985', 'La Esperanza paga'),
  ('lucid_68b4adebe9cd', 'Esperanza Final'),
  ('lucid_38811e5a1257', 'Esperanza Extrema')
) as strategy(id, name)
where lower(users.email) = 'mauriciosebastianamaya@gmail.com'
on conflict(user_id, strategy_id) do update set enabled = true, updated_at = now();

comment on table public.rutyx_route_entitlements is
  'Rutas habilitadas individualmente por Admin Master. No contiene el catálogo confidencial.';
comment on table public.rutyx_route_states is
  'Punto actual de una cuenta dentro de RUTYX, con ratio broker y control de revisión.';
comment on table public.rutyx_route_events is
  'Historial append-only de inicios y resultados confirmados en RUTYX.';
