-- Licenciamiento genérico de complementos NODAL. El primer producto es
-- MIMICAL y el piloto queda limitado a Julián. La credencial vive en la
-- instalación de Ninja; la autenticación Google sólo habilita crear el código.

create table public.addon_products (
  product_key text primary key,
  display_name text not null,
  current_version text not null,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  constraint addon_product_key_valid check (product_key ~ '^[a-z0-9_-]{2,40}$')
);

create table public.addon_entitlements (
  id uuid primary key default gen_random_uuid(),
  product_key text not null references public.addon_products(product_key) on delete restrict,
  owner_user_id uuid not null references public.nodal_users(id) on delete restrict,
  identity_id uuid references public.nodal_identities(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint addon_entitlement_status_dates check (
    (status = 'active' and revoked_at is null) or (status = 'revoked' and revoked_at is not null)
  )
);

create unique index addon_entitlements_context_unique
on public.addon_entitlements(product_key, owner_user_id, coalesce(identity_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.addon_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references public.addon_entitlements(id) on delete restrict,
  code_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint addon_pairing_code_hash_valid check (code_hash ~ '^[0-9a-f]{64}$')
);

create table public.addon_installations (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references public.addon_entitlements(id) on delete restrict,
  installation_key uuid not null,
  installation_token_hash text not null unique,
  installed_version text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  paired_at timestamptz not null default now(),
  last_validated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entitlement_id, installation_key),
  constraint addon_installation_token_hash_valid check (installation_token_hash ~ '^[0-9a-f]{64}$'),
  constraint addon_installation_version_present check (btrim(installed_version) <> ''),
  constraint addon_installation_status_dates check (
    (status = 'active' and revoked_at is null) or (status = 'revoked' and revoked_at is not null)
  )
);

create index addon_installations_entitlement_status_idx
on public.addon_installations(entitlement_id, status, paired_at desc);

create trigger addon_installations_set_updated_at
before update on public.addon_installations
for each row execute function public.set_updated_at();

alter table public.addon_products enable row level security;
alter table public.addon_entitlements enable row level security;
alter table public.addon_pairing_codes enable row level security;
alter table public.addon_installations enable row level security;
revoke all on table public.addon_products, public.addon_entitlements, public.addon_pairing_codes, public.addon_installations from public, anon, authenticated;

insert into public.addon_products(product_key, display_name, current_version)
values ('mimical', 'MIMICAL', '1.1.0');

insert into public.addon_entitlements(product_key, owner_user_id)
values ('mimical', '0c90d147-a048-48c9-8f89-e095bbadc249');

create function public.create_addon_pairing_code(
  target_product_key text,
  target_identity_id uuid,
  target_code_hash text,
  target_expires_at timestamptz
)
returns table(pairing_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_entitlement_id uuid;
  new_pairing_id uuid;
begin
  if actor_id is null or not public.is_current_user_active() then raise exception 'Not authorized'; end if;
  if target_code_hash !~ '^[0-9a-f]{64}$'
    or target_expires_at <= now()
    or target_expires_at > now() + interval '10 minutes'
  then raise exception 'Invalid pairing authorization'; end if;

  if target_identity_id is not null and not exists (
    select 1 from public.nodal_identities identities
    join public.workspaces workspaces on workspaces.id = identities.workspace_id
    where identities.id = target_identity_id
      and identities.onboarding_status = 'approved'
      and workspaces.owner_user_id = actor_id
  ) then raise exception 'Identity is not available'; end if;

  select entitlements.id into selected_entitlement_id
  from public.addon_entitlements entitlements
  join public.addon_products products on products.product_key = entitlements.product_key
  where entitlements.product_key = target_product_key
    and entitlements.owner_user_id = actor_id
    and entitlements.identity_id is not distinct from target_identity_id
    and entitlements.status = 'active'
    and products.status = 'active';

  -- El piloto personal de Julián habilita también sus identidades aprobadas,
  -- pero no convierte a otros usuarios en participantes del piloto.
  if selected_entitlement_id is null and target_identity_id is not null and exists (
    select 1 from public.addon_entitlements entitlements
    where entitlements.product_key = target_product_key
      and entitlements.owner_user_id = actor_id
      and entitlements.identity_id is null
      and entitlements.status = 'active'
  ) then
    insert into public.addon_entitlements(product_key, owner_user_id, identity_id)
    values (target_product_key, actor_id, target_identity_id)
    on conflict (product_key, owner_user_id, (coalesce(identity_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    do update set status = 'active', revoked_at = null
    returning id into selected_entitlement_id;
  end if;

  if selected_entitlement_id is null then raise exception 'Add-on is not enabled'; end if;

  update public.addon_pairing_codes codes set expires_at = now()
  where codes.entitlement_id = selected_entitlement_id and codes.consumed_at is null and codes.expires_at > now();
  insert into public.addon_pairing_codes(entitlement_id, code_hash, expires_at)
  values (selected_entitlement_id, target_code_hash, target_expires_at)
  returning id into new_pairing_id;

  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values (actor_id, 'addon_pairing_codes', new_pairing_id, 'addon_pairing_code_created',
    jsonb_build_object('product_key', target_product_key, 'identity_id', target_identity_id, 'expires_at', target_expires_at),
    'Codigo temporal de vinculacion solicitado desde NODAL App');
  return query select new_pairing_id, target_expires_at;
end;
$$;

create function public.redeem_addon_pairing_code(
  target_product_key text,
  target_code_hash text,
  target_installation_key uuid,
  target_installation_token_hash text,
  target_version text
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
  select codes.* into selected_code
  from public.addon_pairing_codes codes
  join public.addon_entitlements entitlements on entitlements.id = codes.entitlement_id
  where codes.code_hash = target_code_hash and codes.consumed_at is null and codes.expires_at > now()
    and entitlements.product_key = target_product_key and entitlements.status = 'active'
  for update of codes;
  if not found then raise exception 'Pairing code is invalid or expired'; end if;

  select * into selected_entitlement from public.addon_entitlements where id = selected_code.entitlement_id;
  if not exists (select 1 from public.nodal_users users where users.id = selected_entitlement.owner_user_id and users.access_state = 'active')
    or not exists (select 1 from public.addon_products products where products.product_key = target_product_key and products.status = 'active')
  then raise exception 'Entitlement is not active'; end if;
  if selected_entitlement.identity_id is not null and not exists (
    select 1 from public.nodal_identities identities where identities.id = selected_entitlement.identity_id and identities.onboarding_status = 'approved'
  ) then raise exception 'Identity is not active'; end if;
  if target_installation_token_hash !~ '^[0-9a-f]{64}$' or nullif(btrim(target_version), '') is null then raise exception 'Invalid installation'; end if;

  update public.addon_installations installations set status = 'revoked', revoked_at = now()
  where installations.entitlement_id = selected_entitlement.id and installations.status = 'active';
  insert into public.addon_installations(entitlement_id, installation_key, installation_token_hash, installed_version)
  values (selected_entitlement.id, target_installation_key, target_installation_token_hash, btrim(target_version))
  on conflict (entitlement_id, installation_key) do update
    set installation_token_hash = excluded.installation_token_hash, installed_version = excluded.installed_version,
        status = 'active', revoked_at = null, paired_at = now(), last_validated_at = now()
  returning id into new_installation_id;
  update public.addon_pairing_codes set consumed_at = now() where id = selected_code.id;

  select case when selected_entitlement.identity_id is null then users.display_name
         else identities.first_name || ' ' || identities.last_name end into selected_label
  from public.nodal_users users
  left join public.nodal_identities identities on identities.id = selected_entitlement.identity_id
  where users.id = selected_entitlement.owner_user_id;

  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values (selected_entitlement.owner_user_id, 'addon_installations', new_installation_id, 'addon_installation_paired',
    jsonb_build_object('product_key', target_product_key, 'identity_id', selected_entitlement.identity_id, 'version', target_version),
    'MIMICAL vinculado mediante codigo temporal');
  return query select new_installation_id, coalesce(nullif(btrim(selected_label), ''), 'Usuario NODAL');
end;
$$;

create function public.validate_addon_installation(
  target_product_key text,
  target_installation_key uuid,
  target_installation_token_hash text
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
begin
  select installations.* into selected_installation
  from public.addon_installations installations
  join public.addon_entitlements entitlements on entitlements.id = installations.entitlement_id
  where installations.installation_key = target_installation_key
    and installations.installation_token_hash = target_installation_token_hash
    and installations.status = 'active' and entitlements.product_key = target_product_key
  for update of installations;
  if not found then return; end if;
  select * into selected_entitlement from public.addon_entitlements where id = selected_installation.entitlement_id;

  if selected_entitlement.status <> 'active'
    or not exists (select 1 from public.addon_products p where p.product_key = target_product_key and p.status = 'active')
    or not exists (select 1 from public.nodal_users u where u.id = selected_entitlement.owner_user_id and u.access_state = 'active')
    or (selected_entitlement.identity_id is not null and not exists (
      select 1 from public.nodal_identities i where i.id = selected_entitlement.identity_id and i.onboarding_status = 'approved'
    ))
  then return query select selected_installation.id, false, 'Acceso no habilitado'::text; return; end if;

  update public.addon_installations set last_validated_at = now() where id = selected_installation.id;
  select case when selected_entitlement.identity_id is null then users.display_name
         else identities.first_name || ' ' || identities.last_name end into selected_label
  from public.nodal_users users
  left join public.nodal_identities identities on identities.id = selected_entitlement.identity_id
  where users.id = selected_entitlement.owner_user_id;
  return query select selected_installation.id, true, coalesce(nullif(btrim(selected_label), ''), 'Usuario NODAL');
end;
$$;

revoke all on function public.create_addon_pairing_code(text,uuid,text,timestamptz) from public, anon;
revoke all on function public.redeem_addon_pairing_code(text,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.validate_addon_installation(text,uuid,text) from public, anon, authenticated;
grant execute on function public.create_addon_pairing_code(text,uuid,text,timestamptz) to authenticated;
grant execute on function public.redeem_addon_pairing_code(text,text,uuid,text,text) to service_role;
grant execute on function public.validate_addon_installation(text,uuid,text) to service_role;
