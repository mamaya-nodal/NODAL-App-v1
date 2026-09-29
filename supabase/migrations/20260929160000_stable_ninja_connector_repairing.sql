-- Pairing replaces credentials, not the logical connector or its history.
-- Existing grants stay service_role-only. No account/economic rows are changed.
create or replace function public.redeem_ninja_pairing_code(
  target_code_hash text,
  target_connector_version text,
  target_access_token_hash text,
  target_access_expires_at timestamptz,
  target_refresh_token_hash text,
  target_refresh_expires_at timestamptz
)
returns table(connector_id uuid, owner_user_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  selected_code public.ninja_pairing_codes%rowtype;
  selected_connector_id uuid;
  was_existing boolean;
begin
  select * into selected_code from public.ninja_pairing_codes codes
  where codes.code_hash = target_code_hash and codes.consumed_at is null
    and codes.expires_at > now()
  for update;
  if not found then raise exception 'Pairing code is invalid or expired'; end if;

  -- Serialize all installations for this owner, including different codes.
  perform 1 from public.nodal_users users
  where users.id = selected_code.owner_user_id and users.access_state = 'active'
  for update;
  if not found then raise exception 'NODAL user is not active'; end if;
  if selected_code.identity_id is not null and not exists (
    select 1 from public.nodal_identities identities
    join public.workspaces spaces on spaces.id = identities.workspace_id
    where identities.id = selected_code.identity_id
      and identities.onboarding_status = 'approved'
      and spaces.owner_user_id = selected_code.owner_user_id
  ) then raise exception 'Identity is not approved for this user'; end if;
  if nullif(btrim(target_connector_version), '') is null then raise exception 'Connector version is required'; end if;
  if target_access_token_hash is null or target_refresh_token_hash is null
    or target_access_token_hash !~ '^[0-9a-f]{64}$' or target_refresh_token_hash !~ '^[0-9a-f]{64}$'
  then raise exception 'Invalid connector credential'; end if;
  if target_access_expires_at is null or target_access_expires_at <= now()
    or target_access_expires_at > now() + interval '20 minutes'
  then raise exception 'Invalid access expiration'; end if;
  if target_refresh_expires_at is null or target_refresh_expires_at <= now() + interval '1 day'
    or target_refresh_expires_at > now() + interval '95 days'
  then raise exception 'Invalid refresh expiration'; end if;

  select connectors.id into selected_connector_id
  from public.ninja_connectors connectors
  where connectors.owner_user_id = selected_code.owner_user_id
    and connectors.identity_id is not distinct from selected_code.identity_id
  order by (connectors.status = 'active') desc, connectors.paired_at desc, connectors.id
  limit 1 for update;
  was_existing := selected_connector_id is not null;
  if was_existing then
    update public.ninja_connectors set
      status = 'active', revoked_at = null, last_seen_at = null,
      connector_version = btrim(target_connector_version), paired_at = now(),
      access_token_hash = target_access_token_hash, access_expires_at = target_access_expires_at,
      refresh_token_hash = target_refresh_token_hash, refresh_expires_at = target_refresh_expires_at
    where id = selected_connector_id;
  else
    insert into public.ninja_connectors(owner_user_id, identity_id, connector_version,
      access_token_hash, access_expires_at, refresh_token_hash, refresh_expires_at)
    values (selected_code.owner_user_id, selected_code.identity_id, btrim(target_connector_version),
      target_access_token_hash, target_access_expires_at, target_refresh_token_hash, target_refresh_expires_at)
    returning id into selected_connector_id;
  end if;
  update public.ninja_pairing_codes set consumed_at = now(), consumed_by_connector_id = selected_connector_id
  where id = selected_code.id;
  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values (selected_code.owner_user_id, 'ninja_connectors', selected_connector_id,
    case when was_existing then 'ninja_connector_repaired' else 'ninja_connector_paired' end,
    jsonb_build_object('identity_id', selected_code.identity_id,
      'connector_version', btrim(target_connector_version), 'history_preserved', was_existing),
    'Vinculacion autorizada: credenciales nuevas conservando el historial del mismo usuario e identidad');
  return query select selected_connector_id, selected_code.owner_user_id;
end;
$$;
