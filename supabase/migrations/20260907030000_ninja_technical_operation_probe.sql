-- Excepción técnica y aislada para probar la delimitación automática de operaciones.
-- No crea ni modifica registros económicos.

create table public.ninja_operation_probe_allowlist (
  connector_id uuid not null references public.ninja_connectors(id) on delete cascade,
  connection_name text not null,
  account_name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (connector_id, connection_name, account_name),
  constraint ninja_operation_probe_allowlist_connection_present check (length(btrim(connection_name)) between 1 and 160),
  constraint ninja_operation_probe_allowlist_account_present check (length(btrim(account_name)) between 1 and 160)
);

create table public.ninja_operation_probe_sessions (
  id bigint generated always as identity primary key,
  connector_id uuid not null references public.ninja_connectors(id) on delete cascade,
  connection_name text not null,
  account_name text not null,
  opening_event_id bigint not null references public.ninja_trade_telemetry_events(id) on delete cascade,
  opened_at timestamptz not null,
  flat_at timestamptz,
  last_event_at timestamptz not null,
  settled_at timestamptz,
  status text not null check (status in ('open', 'settling', 'closed')),
  opening_balance numeric,
  closing_balance numeric,
  result numeric,
  execution_count integer not null default 0 check (execution_count >= 0),
  instruments text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connector_id, opening_event_id),
  constraint ninja_operation_probe_session_balance_pair check (
    result is null or (opening_balance is not null and closing_balance is not null)
  )
);

create index ninja_operation_probe_sessions_connector_opened_idx
on public.ninja_operation_probe_sessions (connector_id, opened_at desc, id desc);

alter table public.ninja_operation_probe_allowlist enable row level security;
alter table public.ninja_operation_probe_sessions enable row level security;
revoke all on table public.ninja_operation_probe_allowlist from public, anon, authenticated;
revoke all on table public.ninja_operation_probe_sessions from public, anon, authenticated;

create function public.get_current_user_ninja_operation_probe_sessions(target_limit integer default 20)
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
  join public.ninja_operation_probe_allowlist allowlist
    on allowlist.connector_id = sessions.connector_id
    and allowlist.connection_name = sessions.connection_name
    and allowlist.account_name = sessions.account_name
    and allowlist.enabled
  where connectors.owner_user_id = (select auth.uid())
    and connectors.status = 'active'
  order by sessions.opened_at desc, sessions.id desc
  limit least(greatest(coalesce(target_limit, 20), 1), 100);
$$;

revoke all on function public.get_current_user_ninja_operation_probe_sessions(integer) from public, anon;
grant execute on function public.get_current_user_ninja_operation_probe_sessions(integer) to authenticated;
