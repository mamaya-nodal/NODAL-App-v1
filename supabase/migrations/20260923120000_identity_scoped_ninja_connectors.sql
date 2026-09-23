-- Un usuario NODAL puede operar desde su Ninja principal y desde un Ninja por
-- identidad aprobada. Cada instalacion conserva credenciales independientes y
-- todo lo recibido sigue perteneciendo al mismo usuario/contabilidad.

alter table public.ninja_connectors
  add column identity_id uuid references public.nodal_identities(id) on delete restrict;

alter table public.ninja_pairing_codes
  add column identity_id uuid references public.nodal_identities(id) on delete restrict;

drop index public.ninja_connectors_one_active_per_user;

create unique index ninja_connectors_one_active_owner_scope
on public.ninja_connectors(owner_user_id)
where status = 'active' and identity_id is null;

create unique index ninja_connectors_one_active_identity_scope
on public.ninja_connectors(owner_user_id, identity_id)
where status = 'active' and identity_id is not null;

create index ninja_connectors_owner_identity_idx
on public.ninja_connectors(owner_user_id, identity_id, paired_at desc);

create function public.validate_ninja_connector_identity_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.identity_id is null then return new; end if;

  if not exists (
    select 1
    from public.nodal_identities identities
    join public.workspaces workspaces on workspaces.id = identities.workspace_id
    where identities.id = new.identity_id
      and identities.onboarding_status = 'approved'
      and workspaces.owner_user_id = new.owner_user_id
  ) then
    raise exception 'Identity connector scope is not available for this user';
  end if;
  return new;
end;
$$;

create trigger ninja_connectors_validate_identity_scope
before insert or update of owner_user_id, identity_id on public.ninja_connectors
for each row execute function public.validate_ninja_connector_identity_scope();

create trigger ninja_pairing_codes_validate_identity_scope
before insert or update of owner_user_id, identity_id on public.ninja_pairing_codes
for each row execute function public.validate_ninja_connector_identity_scope();

drop function public.create_ninja_pairing_code(text, timestamptz);

create function public.create_ninja_pairing_code(
  target_code_hash text,
  target_expires_at timestamptz,
  target_identity_id uuid default null
)
returns table(pairing_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  new_pairing_id uuid;
begin
  if actor_id is null or not public.is_current_user_active() then
    raise exception 'Not authorized';
  end if;
  if target_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid pairing code hash';
  end if;
  if target_expires_at <= now() or target_expires_at > now() + interval '10 minutes' then
    raise exception 'Invalid pairing expiration';
  end if;
  if target_identity_id is not null and not exists (
    select 1
    from public.nodal_identities identities
    join public.workspaces workspaces on workspaces.id = identities.workspace_id
    where identities.id = target_identity_id
      and identities.onboarding_status = 'approved'
      and workspaces.owner_user_id = actor_id
  ) then
    raise exception 'Identity is not approved for this user';
  end if;

  update public.ninja_pairing_codes codes
  set expires_at = now()
  where codes.owner_user_id = actor_id
    and codes.identity_id is not distinct from target_identity_id
    and codes.consumed_at is null
    and codes.expires_at > now();

  insert into public.ninja_pairing_codes(
    owner_user_id, identity_id, code_hash, expires_at
  ) values (
    actor_id, target_identity_id, target_code_hash, target_expires_at
  ) returning id into new_pairing_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id,
    'ninja_pairing_codes',
    new_pairing_id,
    'ninja_pairing_code_created',
    jsonb_build_object('expires_at', target_expires_at, 'identity_id', target_identity_id),
    case when target_identity_id is null
      then 'Codigo temporal solicitado para el Ninja principal'
      else 'Codigo temporal solicitado para el Ninja de una identidad'
    end
  );

  return query select new_pairing_id, target_expires_at;
end;
$$;

create or replace function public.redeem_ninja_pairing_code(
  target_code_hash text,
  target_connector_version text,
  target_access_token_hash text,
  target_access_expires_at timestamptz,
  target_refresh_token_hash text,
  target_refresh_expires_at timestamptz
)
returns table(connector_id uuid, owner_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_code public.ninja_pairing_codes%rowtype;
  new_connector_id uuid;
begin
  select * into selected_code
  from public.ninja_pairing_codes codes
  where codes.code_hash = target_code_hash
    and codes.consumed_at is null
    and codes.expires_at > now()
  for update;

  if not found then raise exception 'Pairing code is invalid or expired'; end if;
  if not exists (
    select 1 from public.nodal_users users
    where users.id = selected_code.owner_user_id and users.access_state = 'active'
  ) then raise exception 'NODAL user is not active'; end if;
  if nullif(btrim(target_connector_version), '') is null then raise exception 'Connector version is required'; end if;
  if target_access_token_hash !~ '^[0-9a-f]{64}$' or target_refresh_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid connector credential';
  end if;
  if target_access_expires_at <= now() or target_access_expires_at > now() + interval '20 minutes' then
    raise exception 'Invalid access expiration';
  end if;
  if target_refresh_expires_at <= now() + interval '1 day' or target_refresh_expires_at > now() + interval '95 days' then
    raise exception 'Invalid refresh expiration';
  end if;

  update public.ninja_connectors connectors
  set status = 'revoked', revoked_at = now()
  where connectors.owner_user_id = selected_code.owner_user_id
    and connectors.identity_id is not distinct from selected_code.identity_id
    and connectors.status = 'active';

  insert into public.ninja_connectors(
    owner_user_id, identity_id, connector_version,
    access_token_hash, access_expires_at,
    refresh_token_hash, refresh_expires_at
  ) values (
    selected_code.owner_user_id, selected_code.identity_id,
    btrim(target_connector_version), target_access_token_hash,
    target_access_expires_at, target_refresh_token_hash,
    target_refresh_expires_at
  ) returning id into new_connector_id;

  update public.ninja_pairing_codes codes
  set consumed_at = now(), consumed_by_connector_id = new_connector_id
  where codes.id = selected_code.id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    selected_code.owner_user_id,
    'ninja_connectors',
    new_connector_id,
    'ninja_connector_paired',
    jsonb_build_object(
      'connector_version', btrim(target_connector_version),
      'identity_id', selected_code.identity_id
    ),
    case when selected_code.identity_id is null
      then 'Ninja principal vinculado mediante codigo temporal'
      else 'Ninja de identidad vinculado mediante codigo temporal'
    end
  );

  return query select new_connector_id, selected_code.owner_user_id;
end;
$$;

drop function public.get_current_user_ninja_connector_status();

create function public.get_current_user_ninja_connector_status()
returns table(
  connector_id uuid,
  status text,
  connector_version text,
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

create function public.revoke_ninja_connector(
  target_connector_id uuid,
  management_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_connector_id uuid;
begin
  if actor_id is null or not public.is_current_user_active() then raise exception 'Not authorized'; end if;
  if nullif(btrim(management_reason), '') is null then raise exception 'Reason is required'; end if;

  update public.ninja_connectors connectors
  set status = 'revoked', revoked_at = now()
  where connectors.id = target_connector_id
    and connectors.owner_user_id = actor_id
    and connectors.status = 'active'
  returning connectors.id into selected_connector_id;

  if selected_connector_id is null then return false; end if;
  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, reason)
  values (actor_id, 'ninja_connectors', selected_connector_id, 'ninja_connector_revoked', btrim(management_reason));
  return true;
end;
$$;

-- La identidad es una dimension de atribucion. No crea asientos ni modifica la
-- contabilidad del usuario titular. Toda cuenta vinculada desde ese conector
-- queda asignada automaticamente a la identidad del conector.
create function public.assign_ninja_link_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_identity_id uuid;
  target_workspace_id uuid;
  account_workspace_id uuid;
  active_assignment public.identity_account_assignments%rowtype;
begin
  select connectors.identity_id, identities.workspace_id
    into target_identity_id, target_workspace_id
  from public.ninja_connectors connectors
  left join public.nodal_identities identities on identities.id = connectors.identity_id
  where connectors.id = new.connector_id;

  if target_identity_id is null then return new; end if;

  select periods.workspace_id into account_workspace_id
  from public.accounts accounts
  join public.periods periods on periods.id = accounts.period_id
  where accounts.id = new.account_id;

  if account_workspace_id is distinct from target_workspace_id then
    raise exception 'Detected account is outside the connector identity workspace';
  end if;

  select assignments.* into active_assignment
  from public.identity_account_assignments assignments
  where assignments.account_id = new.account_id
    and assignments.unassigned_at is null
  for update;

  if active_assignment.id is not null then
    if active_assignment.identity_id = target_identity_id then return new; end if;
    raise exception 'Detected account is already assigned to another identity';
  end if;

  insert into public.identity_account_assignments(
    workspace_id, identity_id, account_id, created_by
  ) values (
    target_workspace_id, target_identity_id, new.account_id, new.linked_by
  );

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    new.linked_by, 'accounts', new.account_id, 'identity_account_auto_assigned',
    jsonb_build_object(
      'identity_id', target_identity_id,
      'connector_id', new.connector_id,
      'connection_name', new.connection_name,
      'external_account_name', new.external_account_name
    ),
    'Asignacion inferida por el conector exclusivo de la identidad'
  );
  return new;
end;
$$;

create trigger ninja_account_links_assign_identity
after insert or update of account_id, connector_id on public.ninja_account_links
for each row execute function public.assign_ninja_link_identity();

revoke all on function public.create_ninja_pairing_code(text, timestamptz, uuid) from public, anon;
revoke all on function public.get_current_user_ninja_connector_status() from public, anon;
revoke all on function public.revoke_ninja_connector(uuid, text) from public, anon;
grant execute on function public.create_ninja_pairing_code(text, timestamptz, uuid) to authenticated;
grant execute on function public.get_current_user_ninja_connector_status() to authenticated;
grant execute on function public.revoke_ninja_connector(uuid, text) to authenticated;

