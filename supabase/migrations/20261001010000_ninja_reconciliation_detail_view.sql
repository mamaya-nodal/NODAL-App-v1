-- APP-128: una conciliacion automatica debe poder leerse como una unidad.
-- Expone al titular el broker, las props, posiciones, instrumentos y tiempos
-- ya persistidos. No crea ni modifica registros economicos.

create or replace function public.get_current_user_ninja_reconciliation_details(
  target_limit integer default 100
)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(jsonb_agg(items.payload order by items.opened_at desc, items.id desc), '[]'::jsonb)
  from (
    select
      batches.id,
      batches.opened_at,
      jsonb_build_object(
        'id', batches.id,
        'opened_at', batches.opened_at,
        'settled_at', batches.settled_at,
        'correlation_status', batches.status,
        'accounting_mode', batches.accounting_mode,
        'accounting_status', batches.accounting_status,
        'blocking_reason', batches.accounting_blocking_reason,
        'operated_on', batches.operated_on,
        'broker_result_cents', batches.broker_result_cents,
        'rounding_difference_cents', batches.rounding_difference_cents,
        'company_name', companies.display_name,
        'phase', batches.accounting_phase::text,
        'daily_control_id', batches.daily_control_id,
        'broker', (
          select jsonb_build_object(
            'session_id', sessions.id,
            'account_name', sessions.account_name,
            'connection_name', sessions.connection_name,
            'opened_at', sessions.opened_at,
            'settled_at', sessions.settled_at,
            'result', sessions.result,
            'direction', sessions.direction,
            'quantity', sessions.quantity,
            'instruments', sessions.instruments
          )
          from public.ninja_operation_batch_members members
          join public.ninja_operation_probe_sessions sessions
            on sessions.id = members.session_id
          where members.batch_id = batches.id
            and members.role = 'broker'
          limit 1
        ),
        'prop_accounts', coalesce((
          select jsonb_agg(jsonb_build_object(
            'session_id', sessions.id,
            'account_id', members.account_id,
            'account_name', sessions.account_name,
            'connection_name', sessions.connection_name,
            'opened_at', sessions.opened_at,
            'settled_at', sessions.settled_at,
            'result', sessions.result,
            'direction', sessions.direction,
            'quantity', sessions.quantity,
            'instruments', sessions.instruments,
            'allocated_broker_result_in_cents', members.allocated_broker_result_cents
          ) order by sessions.account_name, sessions.id)
          from public.ninja_operation_batch_members members
          join public.ninja_operation_probe_sessions sessions
            on sessions.id = members.session_id
          where members.batch_id = batches.id
            and members.role = 'prop'
        ), '[]'::jsonb)
      ) as payload
    from public.ninja_operation_batches batches
    join public.ninja_connectors connectors on connectors.id = batches.connector_id
    left join public.companies companies on companies.id = batches.accounting_company_id
    where connectors.owner_user_id = (select auth.uid())
      and connectors.status = 'active'
    order by batches.opened_at desc, batches.id desc
    limit least(greatest(coalesce(target_limit, 100), 1), 500)
  ) items;
$$;

revoke all on function public.get_current_user_ninja_reconciliation_details(integer)
from public, anon;
grant execute on function public.get_current_user_ninja_reconciliation_details(integer)
to authenticated;

comment on function public.get_current_user_ninja_reconciliation_details(integer) is
  'Returns complete owner-scoped Ninja reconciliation units for Operations automation and two-month history.';
