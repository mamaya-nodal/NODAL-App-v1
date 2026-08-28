create table public.ninja_transition_states (
  connector_id uuid primary key references public.ninja_connectors(id) on delete cascade,
  revision bigint not null default 0,
  state jsonb not null default '{"lives":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint ninja_transition_state_object check (jsonb_typeof(state) = 'object')
);

create table public.ninja_account_change_events (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references public.ninja_connectors(id) on delete cascade,
  source_event_id text not null,
  occurred_at timestamptz not null,
  connection_name text not null,
  event_type text not null,
  automatic boolean not null,
  resolution_status text not null check (resolution_status in ('automatic', 'pending', 'confirmed', 'dismissed')),
  from_account_name text,
  to_account_name text,
  from_life_id text,
  to_life_id text,
  reason text not null,
  created_at timestamptz not null default now(),
  unique(connector_id, source_event_id, connection_name, event_type, from_life_id, to_life_id)
);

create index ninja_account_change_events_connector_occurred_idx
on public.ninja_account_change_events(connector_id, occurred_at desc);

alter table public.ninja_transition_states enable row level security;
alter table public.ninja_account_change_events enable row level security;
revoke all on table public.ninja_transition_states from public, anon, authenticated;
revoke all on table public.ninja_account_change_events from public, anon;
grant select on table public.ninja_account_change_events to authenticated;

create policy ninja_account_change_events_read_own
on public.ninja_account_change_events for select to authenticated
using (exists (
  select 1 from public.ninja_connectors connectors
  where connectors.id = ninja_account_change_events.connector_id
    and connectors.owner_user_id = (select auth.uid())
));

create function public.commit_ninja_transition_state(
  target_connector_id uuid,
  expected_revision bigint,
  target_state jsonb,
  target_events jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_rows integer;
  event jsonb;
begin
  if jsonb_typeof(target_state) <> 'object' or jsonb_typeof(target_events) <> 'array' then
    raise exception 'Invalid transition batch';
  end if;

  insert into public.ninja_transition_states(connector_id, revision, state)
  values(target_connector_id, 0, '{"lives":[]}'::jsonb)
  on conflict(connector_id) do nothing;

  update public.ninja_transition_states states
  set revision = states.revision + 1, state = target_state, updated_at = now()
  where states.connector_id = target_connector_id and states.revision = expected_revision;
  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then return false; end if;

  for event in select value from jsonb_array_elements(target_events)
  loop
    insert into public.ninja_account_change_events(
      connector_id, source_event_id, occurred_at, connection_name, event_type,
      automatic, resolution_status, from_account_name, to_account_name,
      from_life_id, to_life_id, reason
    ) values (
      target_connector_id, event->>'sourceEventId', (event->>'occurredAt')::timestamptz,
      event->>'connectionName', event->>'kind', (event->>'automatic')::boolean,
      case when (event->>'automatic')::boolean then 'automatic' else 'pending' end,
      nullif(event->>'fromAccountName', ''), nullif(event->>'toAccountName', ''),
      nullif(event->>'fromLifeId', ''), nullif(event->>'toLifeId', ''), event->>'reason'
    ) on conflict do nothing;
  end loop;
  return true;
end;
$$;

revoke all on function public.commit_ninja_transition_state(uuid, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_ninja_transition_state(uuid, bigint, jsonb, jsonb) to service_role;

create function public.get_current_user_ninja_change_events(target_limit integer default 8)
returns table(
  id uuid,
  occurred_at timestamptz,
  connection_name text,
  event_type text,
  automatic boolean,
  resolution_status text,
  from_account_name text,
  to_account_name text,
  reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select events.id, events.occurred_at, events.connection_name, events.event_type,
         events.automatic, events.resolution_status, events.from_account_name,
         events.to_account_name, events.reason
  from public.ninja_account_change_events events
  join public.ninja_connectors connectors on connectors.id = events.connector_id
  where connectors.owner_user_id = (select auth.uid())
    and public.is_current_user_active()
  order by events.occurred_at desc
  limit least(greatest(coalesce(target_limit, 8), 1), 50);
$$;

revoke all on function public.get_current_user_ninja_change_events(integer) from public, anon;
grant execute on function public.get_current_user_ninja_change_events(integer) to authenticated;
