create table public.ninja_broker_balance_states (
  connector_id uuid primary key references public.ninja_connectors(id) on delete cascade,
  balance_cents bigint not null check (balance_cents >= 0),
  source_accounts jsonb not null,
  observed_at timestamptz not null,
  source_event_id text not null,
  updated_at timestamptz not null default now(),
  constraint ninja_broker_balance_state_accounts_array check (jsonb_typeof(source_accounts) = 'array')
);

create table public.ninja_broker_balance_events (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references public.ninja_connectors(id) on delete cascade,
  source_event_id text not null,
  observed_at timestamptz not null,
  balance_cents bigint not null check (balance_cents >= 0),
  source_accounts jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  daily_control_id uuid references public.daily_controls(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ninja_broker_balance_event_accounts_array check (jsonb_typeof(source_accounts) = 'array'),
  constraint ninja_broker_balance_event_resolution_consistent check (
    (status = 'pending' and daily_control_id is null and resolved_at is null)
    or (status = 'confirmed' and daily_control_id is not null and resolved_at is not null)
  ),
  unique(connector_id, source_event_id)
);

create index ninja_broker_balance_events_pending_idx
on public.ninja_broker_balance_events(connector_id, observed_at)
where status = 'pending';

alter table public.ninja_broker_balance_states enable row level security;
alter table public.ninja_broker_balance_events enable row level security;
revoke all on table public.ninja_broker_balance_states from public, anon, authenticated;
revoke all on table public.ninja_broker_balance_events from public, anon;
grant select on table public.ninja_broker_balance_events to authenticated;

create policy ninja_broker_balance_events_read_own
on public.ninja_broker_balance_events for select to authenticated
using (exists (
  select 1 from public.ninja_connectors connectors
  where connectors.id = ninja_broker_balance_events.connector_id
    and connectors.owner_user_id = (select auth.uid())
));

create function public.commit_ninja_broker_balance(
  target_connector_id uuid,
  target_source_event_id text,
  target_observed_at timestamptz,
  target_balance_cents bigint,
  target_source_accounts jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_balance bigint;
begin
  if target_connector_id is null or nullif(btrim(target_source_event_id), '') is null
    or target_observed_at is null or target_balance_cents is null or target_balance_cents < 0
    or jsonb_typeof(target_source_accounts) <> 'array' or jsonb_array_length(target_source_accounts) = 0 then
    raise exception 'Invalid broker balance event';
  end if;
  if not exists (
    select 1 from public.ninja_connectors connectors
    where connectors.id = target_connector_id and connectors.status = 'active'
  ) then raise exception 'Connector is not active'; end if;

  select states.balance_cents into previous_balance
  from public.ninja_broker_balance_states states
  where states.connector_id = target_connector_id
  for update;

  insert into public.ninja_broker_balance_states(
    connector_id, balance_cents, source_accounts, observed_at, source_event_id
  ) values (
    target_connector_id, target_balance_cents, target_source_accounts,
    target_observed_at, btrim(target_source_event_id)
  )
  on conflict(connector_id) do update set
    balance_cents = excluded.balance_cents,
    source_accounts = excluded.source_accounts,
    observed_at = excluded.observed_at,
    source_event_id = excluded.source_event_id,
    updated_at = now();

  if previous_balance is not null and previous_balance = target_balance_cents then
    return false;
  end if;

  insert into public.ninja_broker_balance_events(
    connector_id, source_event_id, observed_at, balance_cents, source_accounts
  ) values (
    target_connector_id, btrim(target_source_event_id), target_observed_at,
    target_balance_cents, target_source_accounts
  ) on conflict(connector_id, source_event_id) do nothing;
  return found;
end;
$$;

revoke all on function public.commit_ninja_broker_balance(uuid, text, timestamptz, bigint, jsonb)
from public, anon, authenticated;
grant execute on function public.commit_ninja_broker_balance(uuid, text, timestamptz, bigint, jsonb)
to service_role;

create function public.confirm_ninja_broker_balance_event(
  target_event_id uuid,
  target_daily_control_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_event public.ninja_broker_balance_events%rowtype;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;

  select events.* into selected_event
  from public.ninja_broker_balance_events events
  join public.ninja_connectors connectors on connectors.id = events.connector_id
  where events.id = target_event_id and connectors.owner_user_id = actor_id
  for update of events;
  if not found then raise exception 'Broker balance event is not available'; end if;

  if selected_event.status = 'confirmed' then
    return selected_event.daily_control_id = target_daily_control_id;
  end if;
  if not exists (
    select 1 from public.daily_controls controls
    join public.periods periods on periods.id = controls.period_id
    join public.workspaces spaces on spaces.id = periods.workspace_id
    where controls.id = target_daily_control_id
      and spaces.owner_user_id = actor_id
      and controls.source = 'ninjatrader'
      and controls.source_event_key = 'ninja-balance:' || target_event_id::text
  ) then raise exception 'Daily control does not match broker balance event'; end if;

  update public.ninja_broker_balance_events
  set status = 'confirmed', daily_control_id = target_daily_control_id, resolved_at = now()
  where id = target_event_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id, 'ninja_broker_balance_events', target_event_id,
    'ninja_broker_balance_confirmed',
    jsonb_build_object('daily_control_id', target_daily_control_id,
      'received_balance_cents', selected_event.balance_cents,
      'source_accounts', selected_event.source_accounts),
    'Saldo recibido desde Ninja confirmado por el usuario'
  );
  return true;
end;
$$;

revoke all on function public.confirm_ninja_broker_balance_event(uuid, uuid)
from public, anon;
grant execute on function public.confirm_ninja_broker_balance_event(uuid, uuid)
to authenticated;
