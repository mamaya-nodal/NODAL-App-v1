-- Invitaciones y aprobacion de identidades. Las respuestas documentales siguen
-- en Google Workspace; la aplicacion no almacena contrasenas ni claves de acceso.

create type public.identity_request_status as enum (
  'sending', 'sent', 'submitted', 'accepted', 'rejected'
);

alter table public.nodal_identities
  add column contact_email text,
  add column document_reference text,
  add column phone text,
  add column source_response_id text;

create unique index nodal_identities_workspace_email_unique
on public.nodal_identities(workspace_id, lower(contact_email))
where contact_email is not null;

create table public.identity_onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  recipient_email text not null,
  status public.identity_request_status not null default 'sending',
  invitation_token_hash text not null,
  first_name text,
  last_name text,
  document_reference text,
  phone text,
  drive_folder_url text,
  source_response_id text,
  sent_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete restrict,
  identity_id uuid references public.nodal_identities(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_request_email_normalized check (
    recipient_email = lower(btrim(recipient_email))
    and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  constraint identity_request_submission_complete check (
    status not in ('submitted', 'accepted')
    or (
      nullif(btrim(first_name), '') is not null
      and nullif(btrim(last_name), '') is not null
      and nullif(btrim(document_reference), '') is not null
      and nullif(btrim(phone), '') is not null
      and submitted_at is not null
    )
  ),
  constraint identity_request_drive_url_valid check (
    drive_folder_url is null or drive_folder_url ~ '^https://drive[.]google[.]com/'
  )
);

create unique index identity_onboarding_one_open_email
on public.identity_onboarding_requests(lower(recipient_email))
where status in ('sending', 'sent', 'submitted');
create unique index identity_onboarding_response_unique
on public.identity_onboarding_requests(source_response_id)
where source_response_id is not null;
create index identity_onboarding_workspace_status_idx
on public.identity_onboarding_requests(workspace_id, status, created_at desc);

create table public.integration_webhook_secrets (
  name text primary key,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  constraint integration_webhook_secret_hash_valid check (secret_hash ~ '^[0-9a-f]{64}$')
);

alter table public.integration_webhook_secrets enable row level security;
revoke all on table public.integration_webhook_secrets from public, anon, authenticated;

create trigger identity_onboarding_requests_set_updated_at
before update on public.identity_onboarding_requests
for each row execute function public.set_updated_at();

alter table public.identity_onboarding_requests enable row level security;
create policy identity_onboarding_requests_read_own
on public.identity_onboarding_requests for select to authenticated
using (public.can_access_workspace(workspace_id));

revoke all on table public.identity_onboarding_requests from anon;
revoke insert, update, delete on table public.identity_onboarding_requests from authenticated;
grant select on table public.identity_onboarding_requests to authenticated;

create function public.create_identity_onboarding_request(
  target_workspace_id uuid,
  target_email text,
  target_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_email text := lower(btrim(target_email));
  new_id uuid;
begin
  if actor_id is null or not public.can_access_workspace(target_workspace_id) then
    raise exception 'Unauthorized workspace';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or length(normalized_email) > 254
    or target_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation';
  end if;
  if exists (
    select 1 from public.identity_onboarding_requests requests
    where requests.recipient_email = normalized_email
      and requests.status in ('sending', 'sent', 'submitted')
  ) then
    raise exception 'Open invitation already exists';
  end if;

  insert into public.identity_onboarding_requests(
    workspace_id, recipient_email, invitation_token_hash, created_by
  ) values (
    target_workspace_id, normalized_email, target_token_hash, actor_id
  ) returning id into new_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id, 'identity_onboarding_requests', new_id, 'identity_invitation_created',
    jsonb_build_object('workspace_id', target_workspace_id, 'recipient_email', normalized_email),
    'Solicitud de onboarding creada'
  );
  return new_id;
end;
$$;

create function public.get_identity_invitation_dispatch(
  target_request_id uuid,
  target_token text
)
returns table(recipient_email text, referent_name text)
language sql
security definer
set search_path = ''
as $$
  select requests.recipient_email,
    coalesce(nullif(btrim(users.display_name), ''), users.email)
  from public.identity_onboarding_requests requests
  join public.workspaces workspaces on workspaces.id = requests.workspace_id
  join public.nodal_users users on users.id = workspaces.owner_user_id
  where requests.id = target_request_id
    and requests.status in ('sending', 'sent')
    and requests.invitation_token_hash = encode(extensions.digest(target_token, 'sha256'), 'hex')
  limit 1;
$$;

create function public.mark_identity_invitation_sent(
  target_request_id uuid,
  target_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.identity_onboarding_requests set
    status = 'sent', sent_at = coalesce(sent_at, now())
  where id = target_request_id
    and status in ('sending', 'sent')
    and invitation_token_hash = encode(extensions.digest(target_token, 'sha256'), 'hex');
  return found;
end;
$$;

create function public.submit_identity_onboarding_response(
  target_request_id uuid,
  target_email text,
  target_first_name text,
  target_last_name text,
  target_document_reference text,
  target_phone text,
  target_drive_folder_url text,
  target_response_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(target_email));
begin
  if nullif(btrim(target_first_name), '') is null
    or nullif(btrim(target_last_name), '') is null
    or nullif(btrim(target_document_reference), '') is null
    or nullif(btrim(target_phone), '') is null
    or nullif(btrim(target_response_id), '') is null
    or target_drive_folder_url !~ '^https://drive[.]google[.]com/' then
    return false;
  end if;

  update public.identity_onboarding_requests set
    status = 'submitted',
    first_name = btrim(target_first_name),
    last_name = btrim(target_last_name),
    document_reference = btrim(target_document_reference),
    phone = btrim(target_phone),
    drive_folder_url = btrim(target_drive_folder_url),
    source_response_id = btrim(target_response_id),
    submitted_at = now()
  where id = target_request_id
    and recipient_email = normalized_email
    and status in ('sending', 'sent', 'submitted');
  return found;
end;
$$;

create function public.validate_integration_webhook_secret(
  target_name text,
  target_secret text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.integration_webhook_secrets secrets
    where secrets.name = target_name
      and secrets.secret_hash = encode(extensions.digest(target_secret, 'sha256'), 'hex')
  );
$$;

create function public.approve_identity_onboarding_request(target_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_request public.identity_onboarding_requests;
  new_identity_id uuid;
begin
  select requests.* into selected_request
  from public.identity_onboarding_requests requests
  where requests.id = target_request_id
    and requests.status = 'submitted'
    and public.can_access_workspace(requests.workspace_id)
  for update;
  if actor_id is null or selected_request.id is null then
    raise exception 'Unauthorized request';
  end if;

  insert into public.nodal_identities(
    workspace_id, first_name, last_name, contact_email,
    document_reference, phone, source_response_id, drive_folder_url,
    onboarding_status, documentation_status, credentials_status,
    created_by, updated_by
  ) values (
    selected_request.workspace_id, selected_request.first_name, selected_request.last_name,
    selected_request.recipient_email, selected_request.document_reference,
    selected_request.phone, selected_request.source_response_id,
    selected_request.drive_folder_url, 'approved', 'complete', 'pending',
    actor_id, actor_id
  ) returning id into new_identity_id;

  update public.identity_onboarding_requests set
    status = 'accepted', reviewed_at = now(), reviewed_by = actor_id,
    identity_id = new_identity_id, invitation_token_hash = encode(extensions.digest(extensions.gen_random_uuid()::text, 'sha256'), 'hex')
  where id = selected_request.id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id, 'nodal_identities', new_identity_id, 'identity_approved',
    jsonb_build_object('request_id', target_request_id, 'response_id', selected_request.source_response_id),
    'Identidad creada tras aprobacion del formulario'
  );
  return new_identity_id;
end;
$$;

create function public.reject_identity_onboarding_request(target_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  update public.identity_onboarding_requests requests set
    status = 'rejected', reviewed_at = now(), reviewed_by = actor_id,
    invitation_token_hash = encode(extensions.digest(extensions.gen_random_uuid()::text, 'sha256'), 'hex')
  where requests.id = target_request_id
    and requests.status = 'submitted'
    and actor_id is not null
    and public.can_access_workspace(requests.workspace_id);
  if not found then raise exception 'Unauthorized request'; end if;
end;
$$;

create function public.cancel_identity_onboarding_request(target_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  update public.identity_onboarding_requests requests set
    status = 'rejected', reviewed_at = now(), reviewed_by = actor_id,
    invitation_token_hash = encode(extensions.digest(extensions.gen_random_uuid()::text, 'sha256'), 'hex')
  where requests.id = target_request_id
    and requests.status = 'sending'
    and actor_id is not null
    and public.can_access_workspace(requests.workspace_id);
end;
$$;

revoke all on function public.create_identity_onboarding_request(uuid,text,text) from public, anon;
revoke all on function public.get_identity_invitation_dispatch(uuid,text) from public;
revoke all on function public.mark_identity_invitation_sent(uuid,text) from public;
revoke all on function public.submit_identity_onboarding_response(uuid,text,text,text,text,text,text,text) from public;
revoke all on function public.validate_integration_webhook_secret(text,text) from public;
revoke all on function public.approve_identity_onboarding_request(uuid) from public, anon;
revoke all on function public.reject_identity_onboarding_request(uuid) from public, anon;
revoke all on function public.cancel_identity_onboarding_request(uuid) from public, anon;
grant execute on function public.create_identity_onboarding_request(uuid,text,text) to authenticated;
grant execute on function public.get_identity_invitation_dispatch(uuid,text) to anon, authenticated;
grant execute on function public.mark_identity_invitation_sent(uuid,text) to anon, authenticated;
grant execute on function public.submit_identity_onboarding_response(uuid,text,text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.validate_integration_webhook_secret(text,text) to anon, authenticated;
grant execute on function public.approve_identity_onboarding_request(uuid) to authenticated;
grant execute on function public.reject_identity_onboarding_request(uuid) to authenticated;
grant execute on function public.cancel_identity_onboarding_request(uuid) to authenticated;
