-- Estado operativo manual de las identidades. Se mantiene separado del
-- onboarding, de la documentación y del estado técnico del conector.

create type public.identity_operational_status as enum (
  'unconfigured',
  'configured',
  'active',
  'dead'
);

alter table public.nodal_identities
add column operational_status public.identity_operational_status
not null default 'unconfigured';

create function public.update_nodal_identity_operational_status(
  target_identity_id uuid,
  target_status public.identity_operational_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  previous_row public.nodal_identities;
begin
  select identities.* into previous_row
  from public.nodal_identities identities
  where identities.id = target_identity_id
    and public.can_access_workspace(identities.workspace_id)
  for update;

  if actor_id is null or previous_row.id is null then
    raise exception 'Unauthorized identity';
  end if;

  if previous_row.operational_status is not distinct from target_status then
    return;
  end if;

  update public.nodal_identities
  set operational_status = target_status,
      updated_by = actor_id
  where id = target_identity_id;

  insert into public.audit_events(
    actor_user_id,
    entity_table,
    entity_id,
    action,
    previous_data,
    current_data,
    reason
  ) values (
    actor_id,
    'nodal_identities',
    target_identity_id,
    'identity_operational_status_updated',
    jsonb_build_object('operational_status', previous_row.operational_status),
    jsonb_build_object('operational_status', target_status),
    'Estado operativo modificado manualmente por el usuario titular'
  );
end;
$$;

revoke all on function public.update_nodal_identity_operational_status(
  uuid,
  public.identity_operational_status
) from public, anon;

grant execute on function public.update_nodal_identity_operational_status(
  uuid,
  public.identity_operational_status
) to authenticated;

comment on column public.nodal_identities.operational_status is
  'Clasificación manual del titular: desconfigurada, configurada, activa o muerta.';

comment on function public.update_nodal_identity_operational_status(
  uuid,
  public.identity_operational_status
) is
  'Actualiza con auditoría el estado operativo manual de una identidad propia.';
