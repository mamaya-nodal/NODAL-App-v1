-- APP-190: el estado visible de un destino lógico debe seguir el heartbeat de
-- la instalación física que lo alimenta. El inventario sólo cambia cuando
-- cambian las cuentas y no es una señal de vida.

create index if not exists ninja_connector_destinations_destination_status_idx
on public.ninja_connector_destinations(destination_connector_id, is_enabled, physical_connector_id);

create or replace function public.get_current_user_ninja_connector_status_v2()
returns table(
  connector_id uuid,
  status text,
  connector_version text,
  installed_source_version text,
  paired_at timestamptz,
  last_seen_at timestamptz,
  is_online boolean,
  identity_id uuid,
  identity_first_name text,
  identity_last_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    connectors.id,
    connectors.status,
    coalesce(physical_signal.connector_version, connectors.connector_version),
    coalesce(physical_signal.installed_source_version, connectors.installed_source_version),
    connectors.paired_at,
    case
      when route_state.has_route then route_state.last_enabled_physical_heartbeat
      else connectors.last_seen_at
    end,
    case
      when route_state.has_route then
        route_state.last_enabled_physical_heartbeat is not null
        and route_state.last_enabled_physical_heartbeat >= now() - interval '60 seconds'
      else
        connectors.last_seen_at is not null
        and connectors.last_seen_at >= now() - interval '60 seconds'
    end,
    connectors.identity_id,
    identities.first_name,
    identities.last_name
  from public.ninja_connectors connectors
  left join public.nodal_identities identities
    on identities.id = connectors.identity_id
  left join lateral (
    select
      count(*) > 0 as has_route,
      max(physical.last_seen_at) filter (
        where destinations.is_enabled and physical.status = 'active'
      ) as last_enabled_physical_heartbeat
    from public.ninja_connector_destinations destinations
    join public.ninja_connectors physical
      on physical.id = destinations.physical_connector_id
    where destinations.destination_connector_id = connectors.id
  ) route_state on true
  left join lateral (
    select physical.connector_version, physical.installed_source_version
    from public.ninja_connector_destinations destinations
    join public.ninja_connectors physical
      on physical.id = destinations.physical_connector_id
    where destinations.destination_connector_id = connectors.id
      and destinations.is_enabled
      and physical.status = 'active'
    order by physical.last_seen_at desc nulls last, destinations.linked_at desc
    limit 1
  ) physical_signal on true
  where connectors.owner_user_id = (select auth.uid())
    and connectors.status = 'active'
    and public.is_current_user_active()
  order by connectors.identity_id nulls first, connectors.paired_at desc;
$$;

revoke all on function public.get_current_user_ninja_connector_status_v2() from public, anon;
grant execute on function public.get_current_user_ninja_connector_status_v2() to authenticated;

comment on function public.get_current_user_ninja_connector_status_v2() is
  'Presenta cada destino por el heartbeat de su instalación física habilitada; el inventario no determina si está en línea.';
