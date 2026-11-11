-- La versión instalada no se deduce de una descarga ni de un correo enviado.
-- Sólo se confirma cuando el DLL activo la informa durante su validación.
alter table public.addon_installations
  add column if not exists reported_file_version text,
  add column if not exists reported_file_version_at timestamptz;

update public.addon_products
set current_version = '1.1.0.9'
where product_key = 'mimical';

create or replace function public.validate_addon_installation_with_version(
  target_product_key text,
  target_installation_key uuid,
  target_installation_token_hash text,
  target_mimical_version text
)
returns table(installation_id uuid, allow_new_cycles boolean, owner_label text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_installation public.addon_installations%rowtype;
  selected_entitlement public.addon_entitlements%rowtype;
  selected_label text;
  normalized_version text := nullif(btrim(target_mimical_version), '');
begin
  if normalized_version is not null and normalized_version !~ '^\d+(\.\d+){2,3}$' then
    raise exception 'Invalid MIMICAL version';
  end if;

  select installations.* into selected_installation
  from public.addon_installations installations
  join public.addon_entitlements entitlements on entitlements.id = installations.entitlement_id
  where installations.installation_key = target_installation_key
    and installations.installation_token_hash = target_installation_token_hash
    and installations.status = 'active'
    and entitlements.product_key = target_product_key
  for update of installations;
  if not found then return; end if;

  select * into selected_entitlement from public.addon_entitlements where id = selected_installation.entitlement_id;
  if selected_entitlement.status <> 'active'
    or not exists (select 1 from public.addon_products p where p.product_key = target_product_key and p.status = 'active')
    or not exists (select 1 from public.nodal_users u where u.id = selected_entitlement.owner_user_id and u.access_state = 'active')
    or (selected_entitlement.identity_id is not null and not exists (
      select 1 from public.nodal_identities i where i.id = selected_entitlement.identity_id and i.onboarding_status = 'approved'
    ))
  then
    return query select selected_installation.id, false, 'Acceso no habilitado'::text;
    return;
  end if;

  update public.addon_installations
  set last_validated_at = now(),
      reported_file_version = coalesce(normalized_version, reported_file_version),
      reported_file_version_at = case when normalized_version is null then reported_file_version_at else now() end
  where id = selected_installation.id;

  select case when selected_entitlement.identity_id is null then users.display_name
         else identities.first_name || ' ' || identities.last_name end into selected_label
  from public.nodal_users users
  left join public.nodal_identities identities on identities.id = selected_entitlement.identity_id
  where users.id = selected_entitlement.owner_user_id;

  return query select selected_installation.id, true, coalesce(nullif(btrim(selected_label), ''), 'Usuario NODAL');
end;
$$;

create or replace function public.get_current_user_mimical_installations()
returns table(
  identity_id uuid,
  reported_file_version text,
  reported_file_version_at timestamptz,
  last_validated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    entitlements.identity_id,
    installations.reported_file_version,
    installations.reported_file_version_at,
    installations.last_validated_at
  from public.addon_entitlements entitlements
  join public.addon_installations installations on installations.entitlement_id = entitlements.id
  where entitlements.owner_user_id = (select auth.uid())
    and entitlements.product_key = 'mimical'
    and entitlements.status = 'active'
    and installations.status = 'active';
$$;

revoke all on function public.validate_addon_installation_with_version(text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.validate_addon_installation_with_version(text,uuid,text,text) to service_role;

revoke all on function public.get_current_user_mimical_installations() from public, anon;
grant execute on function public.get_current_user_mimical_installations() to authenticated;
