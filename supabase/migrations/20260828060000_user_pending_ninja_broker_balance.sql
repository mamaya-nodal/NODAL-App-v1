create or replace function public.get_current_user_pending_ninja_broker_balance()
returns table (
  id uuid,
  observed_at timestamptz,
  balance_cents bigint,
  source_accounts jsonb
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    events.id,
    events.observed_at,
    events.balance_cents,
    events.source_accounts
  from public.ninja_broker_balance_events events
  join public.ninja_connectors connectors on connectors.id = events.connector_id
  where connectors.owner_user_id = (select auth.uid())
    and connectors.status = 'active'
    and events.status = 'pending'
  order by events.observed_at
  limit 1;
$$;

revoke all on function public.get_current_user_pending_ninja_broker_balance()
from public, anon;
grant execute on function public.get_current_user_pending_ninja_broker_balance()
to authenticated;
