-- Evita que muestras repetidas de saldo oculten ejecuciones y posiciones
-- relevantes en la prueba técnica del usuario.

create or replace function public.get_current_user_ninja_trade_telemetry(target_limit integer default 100)
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
  with ranked_events as (
    select events.id, events.event_type, events.occurred_at, events.connection_name,
      events.account_name, events.instrument, events.payload,
      row_number() over (
        partition by events.connector_id, events.connection_name, events.account_name, events.event_type
        order by events.occurred_at desc, events.id desc
      ) as event_type_rank
    from public.ninja_trade_telemetry_events events
    join public.ninja_connectors connectors on connectors.id = events.connector_id
    where connectors.owner_user_id = (select auth.uid())
      and connectors.status = 'active'
  )
  select ranked.id, ranked.event_type, ranked.occurred_at, ranked.connection_name,
    ranked.account_name, ranked.instrument, ranked.payload
  from ranked_events ranked
  where ranked.event_type <> 'balance' or ranked.event_type_rank <= 10
  order by ranked.occurred_at desc, ranked.id desc
  limit least(greatest(coalesce(target_limit, 100), 1), 200);
$$;

revoke all on function public.get_current_user_ninja_trade_telemetry(integer) from public, anon;
grant execute on function public.get_current_user_ninja_trade_telemetry(integer) to authenticated;
