-- El servidor de base decide si la señal del conector sigue vigente.

drop function public.get_current_user_ninja_connector_status();

create function public.get_current_user_ninja_connector_status()
returns table(
  connector_id uuid,
  status text,
  connector_version text,
  paired_at timestamptz,
  last_seen_at timestamptz,
  is_online boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select connectors.id, connectors.status, connectors.connector_version,
         connectors.paired_at, connectors.last_seen_at,
         connectors.last_seen_at is not null
           and connectors.last_seen_at >= now() - interval '60 seconds'
  from public.ninja_connectors connectors
  where connectors.owner_user_id = (select auth.uid())
    and connectors.status = 'active'
    and public.is_current_user_active()
  order by connectors.paired_at desc
  limit 1;
$$;

revoke all on function public.get_current_user_ninja_connector_status() from public, anon;
grant execute on function public.get_current_user_ninja_connector_status() to authenticated;
