-- APP-092: automatización Ninja general en modo paralelo. Los lotes se
-- proyectan y concilian, pero no escriben todavía Control Diario.

alter table public.ninja_operation_batches
  add column if not exists accounting_mode text not null default 'shadow'
    check (accounting_mode in ('shadow', 'active')),
  add column if not exists accounting_status text not null default 'blocked'
    check (accounting_status in ('blocked', 'shadow_ready', 'committed')),
  add column if not exists accounting_blocking_reason text,
  add column if not exists accounting_period_id uuid references public.periods(id) on delete restrict,
  add column if not exists accounting_company_id uuid references public.companies(id) on delete restrict,
  add column if not exists accounting_phase public.operation_phase,
  add column if not exists operated_on date,
  add column if not exists daily_control_id uuid references public.daily_controls(id) on delete restrict;

create index if not exists ninja_operation_batches_accounting_status_idx
on public.ninja_operation_batches (connector_id, accounting_status, opened_at desc);

-- La allowlist queda únicamente como excepción para Sim101. Las sesiones que
-- el servidor persiste para cuentas reales ya fueron filtradas por conexión
-- aprobada, vínculo prop o clasificación inequívoca de broker.
create or replace function public.get_current_user_ninja_operation_probe_sessions(target_limit integer default 20)
returns table (
  id bigint,
  connection_name text,
  account_name text,
  opened_at timestamptz,
  flat_at timestamptz,
  settled_at timestamptz,
  status text,
  opening_balance numeric,
  closing_balance numeric,
  result numeric,
  execution_count integer,
  instruments text[]
)
language sql
security definer
set search_path = ''
stable
as $$
  select sessions.id, sessions.connection_name, sessions.account_name,
    sessions.opened_at, sessions.flat_at, sessions.settled_at, sessions.status,
    sessions.opening_balance, sessions.closing_balance, sessions.result,
    sessions.execution_count, sessions.instruments
  from public.ninja_operation_probe_sessions sessions
  join public.ninja_connectors connectors on connectors.id = sessions.connector_id
  where connectors.owner_user_id = (select auth.uid())
    and connectors.status = 'active'
  order by sessions.opened_at desc, sessions.id desc
  limit least(greatest(coalesce(target_limit, 20), 1), 100);
$$;

create or replace function public.get_current_user_ninja_operation_batches(target_limit integer default 30)
returns table (
  id uuid,
  opened_at timestamptz,
  settled_at timestamptz,
  correlation_status text,
  accounting_mode text,
  accounting_status text,
  blocking_reason text,
  operated_on date,
  broker_result_cents bigint,
  rounding_difference_cents bigint,
  company_name text,
  phase text,
  prop_accounts jsonb
)
language sql
security definer
set search_path = ''
stable
as $$
  select batches.id, batches.opened_at, batches.settled_at,
    batches.status, batches.accounting_mode, batches.accounting_status,
    batches.accounting_blocking_reason, batches.operated_on,
    batches.broker_result_cents, batches.rounding_difference_cents,
    companies.display_name, batches.accounting_phase::text,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'accountId', members.account_id,
        'accountName', sessions.account_name,
        'allocatedBrokerResultInCents', members.allocated_broker_result_cents
      ) order by sessions.account_name)
      from public.ninja_operation_batch_members members
      join public.ninja_operation_probe_sessions sessions on sessions.id = members.session_id
      where members.batch_id = batches.id and members.role = 'prop'
    ), '[]'::jsonb)
  from public.ninja_operation_batches batches
  join public.ninja_connectors connectors on connectors.id = batches.connector_id
  left join public.companies companies on companies.id = batches.accounting_company_id
  where connectors.owner_user_id = (select auth.uid())
    and connectors.status = 'active'
  order by batches.opened_at desc, batches.id desc
  limit least(greatest(coalesce(target_limit, 30), 1), 100);
$$;

revoke all on function public.get_current_user_ninja_operation_probe_sessions(integer) from public, anon;
revoke all on function public.get_current_user_ninja_operation_batches(integer) from public, anon;
grant execute on function public.get_current_user_ninja_operation_probe_sessions(integer) to authenticated;
grant execute on function public.get_current_user_ninja_operation_batches(integer) to authenticated;

comment on function public.get_current_user_ninja_operation_batches(integer) is
  'Returns only the authenticated owner automatic Ninja batches and their shadow accounting status.';
