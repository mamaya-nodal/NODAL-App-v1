-- Alta directa de identidades sin invitación ni formulario externo.

create function public.create_nodal_identity_direct(
  target_workspace_id uuid,
  target_first_name text,
  target_last_name text,
  target_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_email text := lower(btrim(target_email));
  new_identity_id uuid;
begin
  if actor_id is null or not public.can_access_workspace(target_workspace_id) then
    raise exception 'Unauthorized workspace';
  end if;
  if nullif(btrim(target_first_name), '') is null
    or nullif(btrim(target_last_name), '') is null
    or length(btrim(target_first_name)) > 100
    or length(btrim(target_last_name)) > 100 then
    raise exception 'Invalid identity name';
  end if;
  if normalized_email is null
    or length(normalized_email) > 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Invalid identity email';
  end if;

  insert into public.nodal_identities(
    workspace_id, first_name, last_name, contact_email,
    onboarding_status, documentation_status, credentials_status,
    created_by, updated_by
  ) values (
    target_workspace_id, btrim(target_first_name), btrim(target_last_name),
    normalized_email, 'approved', 'pending', 'pending', actor_id, actor_id
  ) returning id into new_identity_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id, 'nodal_identities', new_identity_id, 'identity_created_directly',
    jsonb_build_object(
      'workspace_id', target_workspace_id,
      'first_name', btrim(target_first_name),
      'last_name', btrim(target_last_name),
      'contact_email', normalized_email
    ),
    'Alta directa por el usuario NODAL sin formulario externo'
  );

  return new_identity_id;
end;
$$;

revoke all on function public.create_nodal_identity_direct(uuid, text, text, text)
from public, anon;
grant execute on function public.create_nodal_identity_direct(uuid, text, text, text)
to authenticated;

comment on function public.create_nodal_identity_direct(uuid, text, text, text)
is 'Crea una identidad aprobada con nombre y correo, sin solicitud ni formulario de onboarding.';
