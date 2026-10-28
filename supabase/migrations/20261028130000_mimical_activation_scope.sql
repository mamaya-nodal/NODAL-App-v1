-- Separa licencias personales de licencias para identidades.

create function public.redeem_scoped_addon_pairing_code(
  target_product_key text,
  target_code_hash text,
  target_installation_key uuid,
  target_installation_token_hash text,
  target_version text,
  target_activation_scope text
)
returns table(installation_id uuid, owner_label text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_code public.addon_pairing_codes%rowtype;
  selected_entitlement public.addon_entitlements%rowtype;
  new_installation_id uuid;
  selected_label text;
begin
  if target_activation_scope not in ('personal', 'identity') then
    raise exception 'Activation scope is invalid';
  end if;

  select codes.* into selected_code
  from public.addon_pairing_codes codes
  join public.addon_entitlements entitlements on entitlements.id = codes.entitlement_id
  where codes.code_hash = target_code_hash
    and codes.consumed_at is null
    and codes.expires_at > now()
    and entitlements.product_key = target_product_key
    and entitlements.status = 'active'
  for update of codes;
  if not found then raise exception 'Pairing code is invalid or expired'; end if;

  select * into selected_entitlement
  from public.addon_entitlements
  where id = selected_code.entitlement_id;

  if (target_activation_scope = 'personal' and selected_entitlement.identity_id is not null)
    or (target_activation_scope = 'identity' and selected_entitlement.identity_id is null)
  then
    raise exception 'Pairing code does not match this MIMICAL package';
  end if;
  if not exists (
    select 1 from public.nodal_users users
    where users.id = selected_entitlement.owner_user_id and users.access_state = 'active'
  ) or not exists (
    select 1 from public.addon_products products
    where products.product_key = target_product_key and products.status = 'active'
  ) then
    raise exception 'Entitlement is not active';
  end if;
  if selected_entitlement.identity_id is not null and not exists (
    select 1 from public.nodal_identities identities
    where identities.id = selected_entitlement.identity_id
      and identities.onboarding_status = 'approved'
  ) then
    raise exception 'Identity is not active';
  end if;
  if target_installation_token_hash !~ '^[0-9a-f]{64}$'
    or nullif(btrim(target_version), '') is null
  then
    raise exception 'Invalid installation';
  end if;

  update public.addon_installations installations
  set status = 'revoked', revoked_at = now()
  where installations.entitlement_id = selected_entitlement.id
    and installations.status = 'active';

  insert into public.addon_installations(
    entitlement_id, installation_key, installation_token_hash, installed_version
  ) values (
    selected_entitlement.id, target_installation_key,
    target_installation_token_hash, btrim(target_version)
  )
  on conflict (entitlement_id, installation_key) do update
    set installation_token_hash = excluded.installation_token_hash,
        installed_version = excluded.installed_version,
        status = 'active', revoked_at = null,
        paired_at = now(), last_validated_at = now()
  returning id into new_installation_id;

  update public.addon_pairing_codes
  set consumed_at = now()
  where id = selected_code.id;

  select case
    when selected_entitlement.identity_id is null then users.display_name
    else identities.first_name || ' ' || identities.last_name
  end into selected_label
  from public.nodal_users users
  left join public.nodal_identities identities
    on identities.id = selected_entitlement.identity_id
  where users.id = selected_entitlement.owner_user_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    selected_entitlement.owner_user_id, 'addon_installations', new_installation_id,
    'addon_installation_paired',
    jsonb_build_object(
      'product_key', target_product_key,
      'identity_id', selected_entitlement.identity_id,
      'activation_scope', target_activation_scope,
      'version', target_version
    ),
    'MIMICAL vinculado mediante codigo temporal y contexto compatible'
  );

  return query select new_installation_id,
    coalesce(nullif(btrim(selected_label), ''), 'Usuario NODAL');
end;
$$;

revoke all on function public.redeem_scoped_addon_pairing_code(text,text,uuid,text,text,text)
from public, anon, authenticated;
grant execute on function public.redeem_scoped_addon_pairing_code(text,text,uuid,text,text,text)
to service_role;
