-- APP-128 follow-up: la vista completa conserva las exclusiones tecnicas y
-- las asignaciones manuales que ya respetaba la lectura resumida anterior.
-- No modifica lotes, sesiones, controles diarios ni resultados.

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
        'broker', jsonb_build_object(
          'session_id', broker_session.id,
          'account_id', null,
          'account_name', broker_session.account_name,
          'connection_name', broker_session.connection_name,
          'opened_at', broker_session.opened_at,
          'settled_at', broker_session.settled_at,
          'result', broker_session.result,
          'direction', broker_session.direction,
          'quantity', broker_session.quantity,
          'instruments', broker_session.instruments
        ),
        'prop_accounts', coalesce((
          select jsonb_agg(participants.payload order by participants.account_name, participants.session_id)
          from (
            select
              sessions.account_name,
              sessions.id as session_id,
              jsonb_build_object(
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
              ) as payload
            from public.ninja_operation_batch_members members
            join public.ninja_operation_probe_sessions sessions
              on sessions.id = members.session_id
            where members.batch_id = batches.id
              and members.role = 'prop'

            union all

            select
              coalesce(links.external_account_name, company.display_name || ' · Cuenta ' || accounts.reference_number::text),
              null::bigint,
              jsonb_build_object(
                'session_id', null,
                'account_id', manual.account_id,
                'account_name', coalesce(links.external_account_name, company.display_name || ' · Cuenta ' || accounts.reference_number::text),
                'connection_name', links.connection_name,
                'opened_at', batches.opened_at,
                'settled_at', batches.settled_at,
                'result', null,
                'direction', null,
                'quantity', 0,
                'instruments', '[]'::jsonb,
                'allocated_broker_result_in_cents', manual.allocated_broker_result_cents
              )
            from public.ninja_operation_batch_manual_accounts manual
            join public.accounts accounts on accounts.id = manual.account_id
            join public.companies company on company.id = accounts.company_id
            left join lateral (
              select links.external_account_name, links.connection_name
              from public.ninja_account_links links
              where links.account_id = manual.account_id
              order by (links.closed_at is null) desc, links.linked_at desc
              limit 1
            ) links on true
            where manual.batch_id = batches.id
          ) participants
        ), '[]'::jsonb)
      ) as payload
    from public.ninja_operation_batches batches
    join public.ninja_connectors connectors on connectors.id = batches.connector_id
    join public.ninja_operation_probe_sessions broker_session
      on broker_session.id = batches.broker_session_id
    left join public.companies companies on companies.id = batches.accounting_company_id
    where connectors.owner_user_id = (select auth.uid())
      and connectors.status = 'active'
      and broker_session.excluded_at is null
    order by batches.opened_at desc, batches.id desc
    limit least(greatest(coalesce(target_limit, 100), 1), 500)
  ) items;
$$;

revoke all on function public.get_current_user_ninja_reconciliation_details(integer)
from public, anon;
grant execute on function public.get_current_user_ninja_reconciliation_details(integer)
to authenticated;

comment on function public.get_current_user_ninja_reconciliation_details(integer) is
  'Returns complete owner-scoped reconciliation units, excluding superseded technical broker sessions and preserving manual account assignments.';
