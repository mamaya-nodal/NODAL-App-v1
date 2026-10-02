alter table public.ninja_connectors
  add column if not exists installed_source_version text;

alter table public.ninja_connectors
  drop constraint if exists ninja_connector_installed_source_version_valid;

alter table public.ninja_connectors
  add constraint ninja_connector_installed_source_version_valid
  check (
    installed_source_version is null
    or (
      length(btrim(installed_source_version)) between 1 and 40
      and installed_source_version ~ '^[0-9A-Za-z._-]+$'
    )
  );

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
  select connectors.id, connectors.status, connectors.connector_version,
         connectors.installed_source_version,
         connectors.paired_at, connectors.last_seen_at,
         connectors.last_seen_at is not null
           and connectors.last_seen_at >= now() - interval '60 seconds',
         connectors.identity_id, identities.first_name, identities.last_name
  from public.ninja_connectors connectors
  left join public.nodal_identities identities on identities.id = connectors.identity_id
  where connectors.owner_user_id = (select auth.uid())
    and connectors.status = 'active'
    and public.is_current_user_active()
  order by connectors.identity_id nulls first, connectors.paired_at desc;
$$;

revoke all on function public.get_current_user_ninja_connector_status_v2() from public, anon;
grant execute on function public.get_current_user_ninja_connector_status_v2() to authenticated;
