-- APP-157: un usuario revocado que vuelve a autenticarse solicita
-- reactivacion. Nunca recupera acceso ni rol administrativo por ese acto.

create or replace function public.capture_nodal_access_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(new.email));
  requested_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), '')
  );
  previous_profile public.nodal_users%rowtype;
begin
  if normalized_email is null or normalized_email = '' then
    return new;
  end if;

  select * into previous_profile
  from public.nodal_users users
  where users.id = new.id
  for update;

  if previous_profile.id is null then
    insert into public.nodal_users(
      id, email, contact_email, display_name, access_state,
      authorized_at, revoked_at, created_at, updated_at
    ) values (
      new.id, normalized_email, normalized_email, requested_name, 'pending',
      null, null, coalesce(new.created_at, now()), now()
    );

    insert into public.audit_events(
      actor_user_id, entity_table, entity_id, action, current_data, reason
    ) values (
      new.id, 'nodal_users', new.id, 'access_requested',
      jsonb_build_object('access_state', 'pending', 'access_role', 'student'),
      'Primer ingreso con Google; requiere aprobacion de Admin Master'
    );
    return new;
  end if;

  update public.nodal_users
  set email = normalized_email,
      contact_email = coalesce(contact_email, normalized_email),
      display_name = coalesce(display_name, requested_name)
  where id = new.id;

  if previous_profile.access_state = 'revoked'
    and new.last_sign_in_at is not null
    and new.last_sign_in_at > previous_profile.revoked_at then
    update public.nodal_users
    set access_state = 'pending',
        access_role = 'student',
        authorized_at = null,
        revoked_at = null,
        updated_at = now()
    where id = new.id;

    insert into public.audit_events(
      actor_user_id, entity_table, entity_id, action,
      previous_data, current_data, reason
    ) values (
      new.id, 'nodal_users', new.id, 'access_reactivation_requested',
      jsonb_build_object(
        'access_state', previous_profile.access_state,
        'access_role', previous_profile.access_role,
        'revoked_at', previous_profile.revoked_at
      ),
      jsonb_build_object('access_state', 'pending', 'access_role', 'student'),
      'Nuevo ingreso con Google posterior a la baja; requiere aprobacion de Admin Master'
    );
  end if;

  return new;
end;
$$;

-- Recupera solicitudes hechas despues de una baja antes de publicar esta regla.
with candidates as (
  select
    profiles.id,
    profiles.access_role as previous_role,
    profiles.revoked_at,
    auth_users.last_sign_in_at
  from public.nodal_users profiles
  join auth.users auth_users on auth_users.id = profiles.id
  where profiles.access_state = 'revoked'
    and auth_users.last_sign_in_at is not null
    and auth_users.last_sign_in_at > profiles.revoked_at
), reopened as (
  update public.nodal_users profiles
  set access_state = 'pending',
      access_role = 'student',
      authorized_at = null,
      revoked_at = null,
      updated_at = now()
  from candidates
  where profiles.id = candidates.id
  returning profiles.id, candidates.previous_role,
    candidates.revoked_at, candidates.last_sign_in_at
)
insert into public.audit_events(
  actor_user_id, entity_table, entity_id, action,
  previous_data, current_data, reason
)
select
  reopened.id, 'nodal_users', reopened.id, 'access_reactivation_requested',
  jsonb_build_object(
    'access_state', 'revoked',
    'access_role', reopened.previous_role,
    'revoked_at', reopened.revoked_at
  ),
  jsonb_build_object(
    'access_state', 'pending',
    'access_role', 'student',
    'requested_at', reopened.last_sign_in_at
  ),
  'Solicitud recuperada: ingreso con Google posterior a la baja'
from reopened;

revoke all on function public.capture_nodal_access_request() from public, anon, authenticated;

comment on function public.capture_nodal_access_request() is
  'Crea solicitudes iniciales y reabre como pendiente a quien vuelve a ingresar despues de una baja, sin autorizarlo.';
