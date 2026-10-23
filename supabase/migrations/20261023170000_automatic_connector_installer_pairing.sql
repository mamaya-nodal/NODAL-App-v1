-- A connector download carries a short-lived one-use authorization in its
-- filename. Identity email links create that authorization atomically when
-- the authorized download is consumed; no visible/manual code is required.

create function public.consume_identity_connector_download_with_pairing(
  target_installation_id uuid,
  target_token text,
  target_code_hash text,
  target_pairing_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_installation public.identity_connector_installations%rowtype;
  selected_identity public.nodal_identities%rowtype;
  owner_id uuid;
  new_pairing_id uuid;
  first_download boolean;
begin
  if target_token !~ '^[0-9a-f]{64}$'
    or target_code_hash !~ '^[0-9a-f]{64}$'
    or target_pairing_expires_at <= now()
    or target_pairing_expires_at > now() + interval '10 minutes'
  then
    raise exception 'Invalid pairing authorization';
  end if;

  select installations.* into selected_installation
  from public.identity_connector_installations installations
  where installations.id = target_installation_id
    and installations.status in ('sending', 'sent', 'downloaded')
    and installations.expires_at > now()
    and installations.download_token_hash = encode(extensions.digest(target_token, 'sha256'), 'hex')
  for update;
  if selected_installation.id is null then return false; end if;

  select identities.* into selected_identity
  from public.nodal_identities identities
  where identities.id = selected_installation.identity_id
    and identities.onboarding_status = 'approved'
  for update;
  if selected_identity.id is null then return false; end if;

  select workspaces.owner_user_id into owner_id
  from public.workspaces workspaces
  join public.nodal_users users on users.id = workspaces.owner_user_id
  where workspaces.id = selected_installation.workspace_id
    and users.access_state = 'active'
  for update of users;
  if owner_id is null then return false; end if;

  update public.ninja_pairing_codes codes
  set expires_at = now()
  where codes.owner_user_id = owner_id
    and codes.identity_id = selected_identity.id
    and codes.consumed_at is null
    and codes.expires_at > now();

  insert into public.ninja_pairing_codes(
    owner_user_id, identity_id, code_hash, expires_at
  ) values (
    owner_id, selected_identity.id, target_code_hash, target_pairing_expires_at
  ) returning id into new_pairing_id;

  first_download := selected_installation.downloaded_at is null;
  update public.identity_connector_installations
  set status = 'downloaded', downloaded_at = coalesce(downloaded_at, now())
  where id = selected_installation.id;

  if first_download then
    insert into public.audit_events(
      actor_user_id, entity_table, entity_id, action, current_data, reason
    ) values (
      selected_installation.created_by, 'identity_connector_installations',
      selected_installation.id, 'identity_connector_downloaded',
      jsonb_build_object('identity_id', selected_identity.id),
      'Instalador ejecutable descargado mediante enlace temporal'
    );
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    selected_installation.created_by, 'ninja_pairing_codes', new_pairing_id,
    'ninja_pairing_code_created',
    jsonb_build_object(
      'identity_id', selected_identity.id,
      'expires_at', target_pairing_expires_at,
      'delivery', 'automatic_installer'
    ),
    'Autorizacion automatica incluida en el instalador de una identidad'
  );

  return true;
end;
$$;

revoke all on function public.consume_identity_connector_download_with_pairing(uuid,text,text,timestamptz) from public;
grant execute on function public.consume_identity_connector_download_with_pairing(uuid,text,text,timestamptz) to anon, authenticated;
