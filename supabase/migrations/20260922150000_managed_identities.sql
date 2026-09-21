-- Gestion operativa de identidades. No almacena contrasenas, PIN, semillas,
-- claves privadas, codigos 2FA ni documentos personales.

create type public.identity_onboarding_status as enum (
  'invited', 'received', 'approved', 'inactive'
);
create type public.identity_documentation_status as enum (
  'pending', 'received', 'complete'
);
create type public.identity_credentials_status as enum (
  'pending', 'complete', 'update_required'
);

create table public.nodal_identities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  onboarding_status public.identity_onboarding_status not null default 'invited',
  documentation_status public.identity_documentation_status not null default 'pending',
  credentials_status public.identity_credentials_status not null default 'pending',
  drive_folder_url text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique(id, workspace_id),
  constraint nodal_identities_first_name_present check (btrim(first_name) <> ''),
  constraint nodal_identities_last_name_present check (btrim(last_name) <> ''),
  constraint nodal_identities_drive_url_valid check (
    drive_folder_url is null or drive_folder_url ~ '^https://drive\.google\.com/'
  )
);

create table public.identity_account_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  identity_id uuid not null,
  account_id uuid not null references public.accounts(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  ended_by uuid references auth.users(id) on delete restrict,
  correction_reason text,
  foreign key(identity_id, workspace_id)
    references public.nodal_identities(id, workspace_id) on delete restrict,
  constraint identity_assignment_dates_valid check (
    unassigned_at is null or unassigned_at >= assigned_at
  ),
  constraint identity_assignment_reason_valid check (
    unassigned_at is null or nullif(btrim(correction_reason), '') is not null
  )
);

create unique index identity_account_assignments_one_active_account
on public.identity_account_assignments(account_id)
where unassigned_at is null;
create index nodal_identities_workspace_idx
on public.nodal_identities(workspace_id, onboarding_status, last_name, first_name);
create index identity_account_assignments_identity_idx
on public.identity_account_assignments(identity_id, assigned_at desc);

create trigger nodal_identities_set_updated_at
before update on public.nodal_identities
for each row execute function public.set_updated_at();

alter table public.nodal_identities enable row level security;
alter table public.identity_account_assignments enable row level security;

create policy nodal_identities_read_own
on public.nodal_identities for select to authenticated
using (public.can_access_workspace(workspace_id));

create policy identity_account_assignments_read_own
on public.identity_account_assignments for select to authenticated
using (public.can_access_workspace(workspace_id));

revoke all on table public.nodal_identities from anon;
revoke all on table public.identity_account_assignments from anon;
revoke insert, update, delete on table public.nodal_identities from authenticated;
revoke insert, update, delete on table public.identity_account_assignments from authenticated;
grant select on table public.nodal_identities to authenticated;
grant select on table public.identity_account_assignments to authenticated;

create function public.create_nodal_identity(
  target_workspace_id uuid,
  target_first_name text,
  target_last_name text,
  target_drive_folder_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  new_id uuid;
  normalized_url text := nullif(btrim(target_drive_folder_url), '');
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
  if normalized_url is not null and normalized_url !~ '^https://drive\.google\.com/' then
    raise exception 'Invalid Drive folder';
  end if;

  insert into public.nodal_identities(
    workspace_id, first_name, last_name, drive_folder_url, created_by
  ) values (
    target_workspace_id, btrim(target_first_name), btrim(target_last_name),
    normalized_url, actor_id
  ) returning id into new_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id, 'nodal_identities', new_id, 'identity_created',
    jsonb_build_object('workspace_id', target_workspace_id),
    'Alta operativa sin almacenamiento de credenciales'
  );
  return new_id;
end;
$$;

create function public.update_nodal_identity_status(
  target_identity_id uuid,
  target_onboarding_status public.identity_onboarding_status,
  target_documentation_status public.identity_documentation_status,
  target_credentials_status public.identity_credentials_status,
  target_drive_folder_url text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  previous_row public.nodal_identities;
  normalized_url text := nullif(btrim(target_drive_folder_url), '');
begin
  select identities.* into previous_row
  from public.nodal_identities identities
  where identities.id = target_identity_id
    and public.can_access_workspace(identities.workspace_id)
  for update;
  if actor_id is null or previous_row.id is null then raise exception 'Unauthorized identity'; end if;
  if normalized_url is not null and normalized_url !~ '^https://drive\.google\.com/' then
    raise exception 'Invalid Drive folder';
  end if;

  update public.nodal_identities set
    onboarding_status = target_onboarding_status,
    documentation_status = target_documentation_status,
    credentials_status = target_credentials_status,
    drive_folder_url = normalized_url,
    updated_by = actor_id
  where id = target_identity_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
  ) values (
    actor_id, 'nodal_identities', target_identity_id, 'identity_status_updated',
    to_jsonb(previous_row),
    jsonb_build_object(
      'onboarding_status', target_onboarding_status,
      'documentation_status', target_documentation_status,
      'credentials_status', target_credentials_status,
      'drive_folder_url', normalized_url
    ),
    'Actualizacion manual del onboarding'
  );
end;
$$;

create function public.assign_nodal_account_identity(
  target_identity_id uuid,
  target_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_workspace_id uuid;
  account_workspace_id uuid;
  existing_assignment public.identity_account_assignments;
  new_id uuid;
begin
  select identities.workspace_id into selected_workspace_id
  from public.nodal_identities identities
  where identities.id = target_identity_id
    and identities.onboarding_status <> 'inactive'
    and public.can_access_workspace(identities.workspace_id);
  if actor_id is null or selected_workspace_id is null then raise exception 'Unauthorized identity'; end if;

  select periods.workspace_id into account_workspace_id
  from public.accounts accounts
  join public.periods periods on periods.id = accounts.period_id
  where accounts.id = target_account_id;
  if account_workspace_id is distinct from selected_workspace_id then raise exception 'Account outside identity workspace'; end if;

  select assignments.* into existing_assignment
  from public.identity_account_assignments assignments
  where assignments.account_id = target_account_id and assignments.unassigned_at is null
  for update;
  if existing_assignment.id is not null then
    if existing_assignment.identity_id = target_identity_id then return existing_assignment.id; end if;
    raise exception 'Account already assigned';
  end if;

  insert into public.identity_account_assignments(
    workspace_id, identity_id, account_id, created_by
  ) values (
    selected_workspace_id, target_identity_id, target_account_id, actor_id
  ) returning id into new_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id, 'identity_account_assignments', new_id, 'identity_account_assigned',
    jsonb_build_object('identity_id', target_identity_id, 'account_id', target_account_id),
    'Asignacion explicita; no inferida'
  );
  return new_id;
end;
$$;

create function public.unassign_nodal_account_identity(
  target_identity_id uuid,
  target_account_id uuid,
  target_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_assignment public.identity_account_assignments;
begin
  if nullif(btrim(target_reason), '') is null then raise exception 'Correction reason required'; end if;
  select assignments.* into selected_assignment
  from public.identity_account_assignments assignments
  where assignments.identity_id = target_identity_id
    and assignments.account_id = target_account_id
    and assignments.unassigned_at is null
    and public.can_access_workspace(assignments.workspace_id)
  for update;
  if actor_id is null or selected_assignment.id is null then raise exception 'Unauthorized assignment'; end if;

  update public.identity_account_assignments set
    unassigned_at = now(), ended_by = actor_id, correction_reason = btrim(target_reason)
  where id = selected_assignment.id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
  ) values (
    actor_id, 'identity_account_assignments', selected_assignment.id,
    'identity_account_unassigned', to_jsonb(selected_assignment),
    jsonb_build_object('unassigned_at', now()), btrim(target_reason)
  );
end;
$$;

revoke all on function public.create_nodal_identity(uuid,text,text,text) from public, anon;
revoke all on function public.update_nodal_identity_status(uuid,public.identity_onboarding_status,public.identity_documentation_status,public.identity_credentials_status,text) from public, anon;
revoke all on function public.assign_nodal_account_identity(uuid,uuid) from public, anon;
revoke all on function public.unassign_nodal_account_identity(uuid,uuid,text) from public, anon;
grant execute on function public.create_nodal_identity(uuid,text,text,text) to authenticated;
grant execute on function public.update_nodal_identity_status(uuid,public.identity_onboarding_status,public.identity_documentation_status,public.identity_credentials_status,text) to authenticated;
grant execute on function public.assign_nodal_account_identity(uuid,uuid) to authenticated;
grant execute on function public.unassign_nodal_account_identity(uuid,uuid,text) to authenticated;
