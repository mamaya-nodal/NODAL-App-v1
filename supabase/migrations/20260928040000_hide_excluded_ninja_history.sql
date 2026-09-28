-- Las excepciones técnicas se conservan para auditoría, pero no reaparecen en
-- la interfaz. Una cuenta presente en la asignación manual y técnica se muestra
-- una sola vez.

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
  minimum_net_liquidation numeric,
  minimum_net_liquidation_at timestamptz,
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
    sessions.opening_balance, sessions.closing_balance,
    sessions.minimum_net_liquidation, sessions.minimum_net_liquidation_at,
    sessions.result, sessions.execution_count, sessions.instruments
  from public.ninja_operation_probe_sessions sessions
  join public.ninja_connectors connectors on connectors.id = sessions.connector_id
  where connectors.owner_user_id = (select auth.uid())
    and connectors.status = 'active'
    and sessions.excluded_at is null
  order by sessions.opened_at desc, sessions.id desc
  limit least(greatest(coalesce(target_limit, 20), 1), 100);
$$;

revoke all on function public.get_current_user_ninja_operation_probe_sessions(integer)
from public, anon;
grant execute on function public.get_current_user_ninja_operation_probe_sessions(integer)
to authenticated;

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
        'accountName', members.account_name,
        'allocatedBrokerResultInCents', members.allocated_cents
      ) order by members.account_name)
      from (
        select technical.account_id, sessions.account_name,
          technical.allocated_broker_result_cents as allocated_cents
        from public.ninja_operation_batch_members technical
        join public.ninja_operation_probe_sessions sessions on sessions.id = technical.session_id
        where technical.batch_id = batches.id and technical.role = 'prop'
        union all
        select manual.account_id,
          company.display_name || ' · Cuenta ' || accounts.reference_number::text,
          manual.allocated_broker_result_cents
        from public.ninja_operation_batch_manual_accounts manual
        join public.accounts accounts on accounts.id = manual.account_id
        join public.companies company on company.id = accounts.company_id
        where manual.batch_id = batches.id
          and not exists (
            select 1
            from public.ninja_operation_batch_members technical_duplicate
            where technical_duplicate.batch_id = manual.batch_id
              and technical_duplicate.account_id = manual.account_id
              and technical_duplicate.role = 'prop'
          )
      ) members
    ), '[]'::jsonb)
  from public.ninja_operation_batches batches
  join public.ninja_connectors connectors on connectors.id = batches.connector_id
  join public.ninja_operation_probe_sessions broker_session
    on broker_session.id = batches.broker_session_id
  left join public.companies companies on companies.id = batches.accounting_company_id
  where connectors.owner_user_id = (select auth.uid())
    and connectors.status = 'active'
    and broker_session.excluded_at is null
  order by batches.opened_at desc, batches.id desc
  limit least(greatest(coalesce(target_limit, 30), 1), 100);
$$;

revoke all on function public.get_current_user_ninja_operation_batches(integer) from public, anon;
grant execute on function public.get_current_user_ninja_operation_batches(integer) to authenticated;

do $$
begin
  update public.ninja_operation_batch_manual_accounts
  set account_id = '06dd7cbe-c42c-4058-a399-bbb02109e8d7'
  where batch_id = '75f9178c-a814-4851-8994-9fb30bc43e59'
    and account_id = 'f3850e81-7bb3-44c3-9019-6e55f1b600e9';
end;
$$;
