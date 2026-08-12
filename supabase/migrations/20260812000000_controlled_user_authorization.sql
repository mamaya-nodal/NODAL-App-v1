-- Autorizacion NODAL controlada y auditable.
-- No contiene usuarios, correos ni datos personales.

create type public.nodal_access_action as enum ('authorized', 'revoked');

create table public.access_authorization_events (
  id bigint generated always as identity primary key,
  target_user_id uuid not null references auth.users (id) on delete restrict,
  action public.nodal_access_action not null,
  previous_state public.nodal_access_state,
  current_state public.nodal_access_state not null,
  performed_by text not null,
  reason text not null,
  occurred_at timestamptz not null default now(),
  constraint access_authorization_events_reason_present
    check (btrim(reason) <> ''),
  constraint access_authorization_events_state_matches_action check (
    (action = 'authorized' and current_state = 'active')
    or (action = 'revoked' and current_state = 'revoked')
  )
);

create index access_authorization_events_target_idx
on public.access_authorization_events (target_user_id, occurred_at desc);

alter table public.access_authorization_events enable row level security;

revoke all on table public.access_authorization_events from anon, authenticated;
grant select on table public.access_authorization_events to service_role;

create function public.authorize_nodal_user_by_email(
  target_email text,
  target_display_name text,
  authorization_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(target_email));
  matched_auth_user record;
  prior_state public.nodal_access_state;
  operation_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user
  );
begin
  if normalized_email = '' or btrim(authorization_reason) = '' then
    raise exception 'Email and authorization reason are required';
  end if;

  select
    users.id,
    lower(users.email) as email,
    nullif(btrim(users.raw_user_meta_data ->> 'full_name'), '') as google_name
  into matched_auth_user
  from auth.users as users
  where lower(users.email) = normalized_email;

  if not found then
    raise exception 'No authenticated Google user exists for the supplied email';
  end if;

  select users.access_state
  into prior_state
  from public.nodal_users as users
  where users.id = matched_auth_user.id
  for update;

  insert into public.nodal_users (
    id,
    email,
    display_name,
    access_state,
    authorized_at,
    revoked_at
  )
  values (
    matched_auth_user.id,
    matched_auth_user.email,
    coalesce(nullif(btrim(target_display_name), ''), matched_auth_user.google_name),
    'active',
    now(),
    null
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.nodal_users.display_name),
    access_state = 'active',
    authorized_at = case
      when public.nodal_users.access_state = 'active'
        then public.nodal_users.authorized_at
      else now()
    end,
    revoked_at = null;

  if prior_state is distinct from 'active'::public.nodal_access_state then
    insert into public.access_authorization_events (
      target_user_id,
      action,
      previous_state,
      current_state,
      performed_by,
      reason
    )
    values (
      matched_auth_user.id,
      'authorized',
      prior_state,
      'active',
      operation_role,
      btrim(authorization_reason)
    );
  end if;

  return matched_auth_user.id;
end;
$$;

create function public.revoke_nodal_user_by_email(
  target_email text,
  revocation_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(target_email));
  matched_nodal_user record;
  operation_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user
  );
begin
  if normalized_email = '' or btrim(revocation_reason) = '' then
    raise exception 'Email and revocation reason are required';
  end if;

  select users.id, users.access_state
  into matched_nodal_user
  from public.nodal_users as users
  where users.email = normalized_email
  for update;

  if not found then
    raise exception 'No NODAL user exists for the supplied email';
  end if;

  if matched_nodal_user.access_state is distinct from 'revoked'::public.nodal_access_state then
    update public.nodal_users
    set
      access_state = 'revoked',
      revoked_at = now()
    where id = matched_nodal_user.id;

    insert into public.access_authorization_events (
      target_user_id,
      action,
      previous_state,
      current_state,
      performed_by,
      reason
    )
    values (
      matched_nodal_user.id,
      'revoked',
      matched_nodal_user.access_state,
      'revoked',
      operation_role,
      btrim(revocation_reason)
    );
  end if;

  return matched_nodal_user.id;
end;
$$;

revoke all on function public.authorize_nodal_user_by_email(text, text, text)
from public, anon, authenticated;
revoke all on function public.revoke_nodal_user_by_email(text, text)
from public, anon, authenticated;

grant execute on function public.authorize_nodal_user_by_email(text, text, text)
to service_role;
grant execute on function public.revoke_nodal_user_by_email(text, text)
to service_role;
