-- Excepciones operativas: conserva la telemetría y el saldo real, pero excluye
-- una sesión de la conciliación, de los resultados y de la interfaz operativa.

alter table public.ninja_operation_probe_sessions
  add column if not exists excluded_at timestamptz,
  add column if not exists excluded_by uuid references public.nodal_users(id) on delete restrict,
  add column if not exists exclusion_reason text;

alter table public.ninja_operation_probe_sessions
  add constraint ninja_operation_probe_exclusion_complete check (
    (excluded_at is null and excluded_by is null and exclusion_reason is null)
    or (
      excluded_at is not null
      and excluded_by is not null
      and nullif(btrim(exclusion_reason), '') is not null
    )
  );

create index if not exists ninja_operation_probe_active_history_idx
on public.ninja_operation_probe_sessions(connector_id, opened_at desc)
where excluded_at is null;

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

comment on column public.ninja_operation_probe_sessions.excluded_at is
  'Manual exception: raw telemetry remains auditable, but the operation is ignored by accounting.';
