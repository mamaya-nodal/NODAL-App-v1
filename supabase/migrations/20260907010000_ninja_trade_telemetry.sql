-- Telemetría técnica para validar detección de operaciones sin crear registros económicos.

create table public.ninja_trade_telemetry_events (
  id bigint generated always as identity primary key,
  connector_id uuid not null references public.ninja_connectors(id) on delete cascade,
  event_id text not null,
  event_type text not null check (event_type in ('execution', 'position', 'balance')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  connection_name text not null,
  account_name text not null,
  instrument text,
  payload jsonb not null,
  constraint ninja_trade_telemetry_event_id_present check (length(btrim(event_id)) between 1 and 160),
  constraint ninja_trade_telemetry_connection_present check (length(btrim(connection_name)) between 1 and 160),
  constraint ninja_trade_telemetry_account_present check (length(btrim(account_name)) between 1 and 160),
  constraint ninja_trade_telemetry_payload_object check (jsonb_typeof(payload) = 'object'),
  unique (connector_id, event_id)
);

create index ninja_trade_telemetry_connector_occurred_idx
on public.ninja_trade_telemetry_events (connector_id, occurred_at desc, id desc);

alter table public.ninja_trade_telemetry_events enable row level security;
revoke all on table public.ninja_trade_telemetry_events from public, anon, authenticated;

create function public.get_current_user_ninja_trade_telemetry(target_limit integer default 100)
returns table (
  id bigint,
  event_type text,
  occurred_at timestamptz,
  connection_name text,
  account_name text,
  instrument text,
  payload jsonb
)
language sql
security definer
set search_path = ''
stable
as $$
  select events.id, events.event_type, events.occurred_at, events.connection_name,
    events.account_name, events.instrument, events.payload
  from public.ninja_trade_telemetry_events events
  join public.ninja_connectors connectors on connectors.id = events.connector_id
  where connectors.owner_user_id = (select auth.uid())
    and connectors.status = 'active'
  order by events.occurred_at desc, events.id desc
  limit least(greatest(coalesce(target_limit, 100), 1), 200);
$$;

revoke all on function public.get_current_user_ninja_trade_telemetry(integer) from public, anon;
grant execute on function public.get_current_user_ninja_trade_telemetry(integer) to authenticated;
