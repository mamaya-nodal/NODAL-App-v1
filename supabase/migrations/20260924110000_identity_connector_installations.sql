-- Entrega controlada del conector para Ninjas operados por identidades.
-- La persona recibe un enlace temporal, pero no obtiene una cuenta NODAL.

create table public.identity_connector_installations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  identity_id uuid not null references public.nodal_identities(id) on delete restrict,
  recipient_email text not null,
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'downloaded', 'failed')),
  download_token_hash text not null
    check (download_token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  sent_at timestamptz,
  downloaded_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_connector_installation_email_normalized check (
    recipient_email = lower(btrim(recipient_email))
    and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  )
);

create index identity_connector_installations_identity_idx
on public.identity_connector_installations(identity_id, created_at desc);

create unique index identity_connector_installations_one_open
on public.identity_connector_installations(identity_id)
where status in ('sending', 'sent');

create trigger identity_connector_installations_set_updated_at
before update on public.identity_connector_installations
for each row execute function public.set_updated_at();

alter table public.identity_connector_installations enable row level security;

create policy identity_connector_installations_read_own
on public.identity_connector_installations for select to authenticated
using (public.can_access_workspace(workspace_id));

revoke all on table public.identity_connector_installations from anon;
revoke insert, update, delete on table public.identity_connector_installations from authenticated;
grant select on table public.identity_connector_installations to authenticated;

create function public.create_identity_connector_installation(
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

  if actor_id is null or selected_identity.id is null then
    raise exception 'Identity is not available';
  end if;
  if selected_identity.contact_email is null
    or selected_identity.contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or target_token_hash !~ '^[0-9a-f]{64}$'
    or target_expires_at <= now()
    or target_expires_at > now() + interval '25 hours' then
    raise exception 'Invalid connector installation';
  end if;

  update public.identity_connector_installations installations
  set status = 'failed'
  where installations.identity_id = selected_identity.id
    and installations.status in ('sending', 'sent', 'downloaded')
    and installations.expires_at > now();

  insert into public.identity_connector_installations(
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
    actor_id, 'identity_connector_installations', new_id,
    'identity_connector_installation_created',
    jsonb_build_object(
      'identity_id', selected_identity.id,
      'recipient_email', lower(btrim(selected_identity.contact_email)),
      'expires_at', target_expires_at
    ),
    'Envio temporal del conector solicitado por el usuario NODAL'
  );
  return new_id;
end;
$$;

create function public.get_identity_connector_installation_dispatch(
  target_installation_id uuid,
  target_token text
)
returns table(
  recipient_email text,
  referent_name text,
  identity_name text,
  expires_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select installations.recipient_email,
    coalesce(nullif(btrim(users.display_name), ''), users.email),
    btrim(identities.first_name || ' ' || identities.last_name),
    installations.expires_at
  from public.identity_connector_installations installations
  join public.nodal_identities identities on identities.id = installations.identity_id
  join public.workspaces workspaces on workspaces.id = installations.workspace_id
  join public.nodal_users users on users.id = workspaces.owner_user_id
  where installations.id = target_installation_id
    and installations.status in ('sending', 'sent')
    and installations.expires_at > now()
    and installations.download_token_hash = encode(extensions.digest(target_token, 'sha256'), 'hex')
  limit 1;
$$;

create function public.mark_identity_connector_installation_sent(
  target_installation_id uuid,
  target_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_installation public.identity_connector_installations%rowtype;
  was_already_sent boolean := false;
begin
  select installations.sent_at is not null into was_already_sent
  from public.identity_connector_installations installations
  where installations.id = target_installation_id
    and installations.status in ('sending', 'sent')
    and installations.expires_at > now()
    and installations.download_token_hash = encode(extensions.digest(target_token, 'sha256'), 'hex')
  for update;

  update public.identity_connector_installations installations set
    status = 'sent', sent_at = coalesce(sent_at, now())
  where installations.id = target_installation_id
    and installations.status in ('sending', 'sent')
    and installations.expires_at > now()
    and installations.download_token_hash = encode(extensions.digest(target_token, 'sha256'), 'hex')
  returning installations.* into selected_installation;

  if selected_installation.id is null then return false; end if;
  if not was_already_sent then
    insert into public.audit_events(
      actor_user_id, entity_table, entity_id, action, current_data, reason
    ) values (
      selected_installation.created_by, 'identity_connector_installations',
      selected_installation.id, 'identity_connector_installation_sent',
      jsonb_build_object('identity_id', selected_installation.identity_id),
      'Correo de instalacion enviado a la identidad'
    );
  end if;
  return true;
end;
$$;

create function public.consume_identity_connector_download(
  target_installation_id uuid,
  target_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_installation public.identity_connector_installations%rowtype;
begin
  select installations.* into selected_installation
  from public.identity_connector_installations installations
  where installations.id = target_installation_id
    and installations.status in ('sent', 'downloaded')
    and installations.expires_at > now()
    and installations.download_token_hash = encode(extensions.digest(target_token, 'sha256'), 'hex')
  for update;

  if selected_installation.id is null then return false; end if;
  if selected_installation.downloaded_at is null then
    update public.identity_connector_installations
    set status = 'downloaded', downloaded_at = now()
    where id = selected_installation.id;

    insert into public.audit_events(
      actor_user_id, entity_table, entity_id, action, current_data, reason
    ) values (
      selected_installation.created_by, 'identity_connector_installations',
      selected_installation.id, 'identity_connector_downloaded',
      jsonb_build_object('identity_id', selected_installation.identity_id),
      'Conector descargado mediante enlace temporal'
    );
  end if;
  return true;
end;
$$;

create function public.cancel_identity_connector_installation(
  target_installation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  update public.identity_connector_installations installations
  set status = 'failed'
  where installations.id = target_installation_id
    and installations.status = 'sending'
    and actor_id is not null
    and public.can_access_workspace(installations.workspace_id);
end;
$$;

revoke all on function public.create_identity_connector_installation(uuid,text,timestamptz) from public, anon;
revoke all on function public.get_identity_connector_installation_dispatch(uuid,text) from public;
revoke all on function public.mark_identity_connector_installation_sent(uuid,text) from public;
revoke all on function public.consume_identity_connector_download(uuid,text) from public;
revoke all on function public.cancel_identity_connector_installation(uuid) from public, anon;
grant execute on function public.create_identity_connector_installation(uuid,text,timestamptz) to authenticated;
grant execute on function public.get_identity_connector_installation_dispatch(uuid,text) to anon, authenticated;
grant execute on function public.mark_identity_connector_installation_sent(uuid,text) to anon, authenticated;
grant execute on function public.consume_identity_connector_download(uuid,text) to anon, authenticated;
grant execute on function public.cancel_identity_connector_installation(uuid) to authenticated;
