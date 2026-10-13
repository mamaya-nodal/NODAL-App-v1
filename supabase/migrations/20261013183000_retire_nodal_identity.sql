-- Baja reversible de identidades desde el panel personal. La fila y su
-- auditoría se conservan; una identidad con dependencias activas no se retira.

create or replace function public.retire_nodal_identity(
  target_identity_id uuid
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
  if previous_row.onboarding_status = 'inactive' then
    return;
  end if;
  if exists (
    select 1 from public.identity_account_assignments assignments
    where assignments.identity_id = target_identity_id
      and assignments.unassigned_at is null
  ) then
    raise exception 'Identity has active account assignments';
  end if;
  if exists (
    select 1 from public.nodal_wallet_sources sources
    where sources.identity_id = target_identity_id
  ) then
    raise exception 'Identity has wallet assignments';
  end if;
  if exists (
    select 1 from public.ninja_connectors connectors
    where connectors.identity_id = target_identity_id
      and connectors.status = 'active'
  ) then
    raise exception 'Identity has active connector';
  end if;

  update public.identity_connector_installations installations
  set status = 'failed'
  where installations.identity_id = target_identity_id
    and installations.status in ('sending', 'sent');

  update public.ninja_identity_signal_controls controls
  set is_enabled = false,
      changed_at = now(),
      changed_by = actor_id
  where controls.identity_id = target_identity_id;

  update public.ninja_connector_destinations destinations
  set is_enabled = false
  where destinations.identity_id = target_identity_id;

  update public.nodal_identities
  set onboarding_status = 'inactive',
      operational_status = 'dead',
      updated_by = actor_id
  where id = target_identity_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action,
    previous_data, current_data, reason
  ) values (
    actor_id, 'nodal_identities', target_identity_id, 'identity_retired',
    to_jsonb(previous_row),
    jsonb_build_object(
      'onboarding_status', 'inactive',
      'operational_status', 'dead'
    ),
    'Baja solicitada por el titular; historial y trazabilidad preservados'
  );
end;
$$;

revoke all on function public.retire_nodal_identity(uuid) from public, anon;
grant execute on function public.retire_nodal_identity(uuid) to authenticated;

comment on function public.retire_nodal_identity(uuid) is
  'Retira del panel una identidad propia sin borrar historial y bloquea la baja si conserva dependencias activas.';
