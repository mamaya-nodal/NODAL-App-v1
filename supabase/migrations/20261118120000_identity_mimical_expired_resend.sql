-- Retire every previous open link, including expired links, before resending.
-- Keep the identity row lock, permission checks, token expiry and audit unchanged.
create or replace function public.create_identity_mimical_installation(
  target_identity_id uuid,
  target_token_hash text,
  target_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_identity public.nodal_identities%rowtype;
  new_id uuid;
begin
  select identities.* into selected_identity
  from public.nodal_identities identities
  where identities.id = target_identity_id
    and identities.onboarding_status = 'approved'
    and public.can_access_workspace(identities.workspace_id)
  for update;

  if actor_id is null or selected_identity.id is null
    or not exists (
      select 1 from public.nodal_users users
      where users.id = actor_id
        and users.access_state = 'active'
        and users.identities_enabled = true
        and users.configuration_enabled = true
    )
    or not exists (
      select 1 from public.addon_entitlements entitlements
      where entitlements.product_key = 'mimical'
        and entitlements.owner_user_id = actor_id
        and entitlements.status = 'active'
        and (entitlements.identity_id is null or entitlements.identity_id = selected_identity.id)
    )
  then
    raise exception 'Identity add-on is not available';
  end if;
  if selected_identity.contact_email is null
    or selected_identity.contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or target_token_hash !~ '^[0-9a-f]{64}$'
    or target_expires_at <= now()
    or target_expires_at > now() + interval '25 hours'
  then
    raise exception 'Invalid MIMICAL installation';
  end if;

  update public.identity_mimical_installations installations
  set status = 'failed'
  where installations.identity_id = selected_identity.id
    and installations.status in ('sending', 'sent');

  insert into public.identity_mimical_installations(
    workspace_id, identity_id, recipient_email, download_token_hash,
    expires_at, created_by
  ) values (
    selected_identity.workspace_id, selected_identity.id,
    lower(btrim(selected_identity.contact_email)), target_token_hash,
    target_expires_at, actor_id
  ) returning id into new_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id, 'identity_mimical_installations', new_id,
    'identity_mimical_installation_created',
    jsonb_build_object('identity_id', selected_identity.id, 'expires_at', target_expires_at),
    'Envio temporal de MIMICAL solicitado por el usuario NODAL'
  );
  return new_id;
end;
$$;

