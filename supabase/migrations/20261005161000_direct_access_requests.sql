-- APP-152: todo primer ingreso con Google crea una solicitud visible para
-- Admin Master. Las altas directas de la Mesa Principal no dependen de una
-- invitacion previa y siguen requiriendo aprobacion explicita.

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
begin
  if normalized_email is null or normalized_email = '' then
    return new;
  end if;

  insert into public.nodal_users(
    id, email, contact_email, display_name, access_state,
    authorized_at, revoked_at, created_at, updated_at
  ) values (
    new.id, normalized_email, normalized_email, requested_name, 'pending',
    null, null, coalesce(new.created_at, now()), now()
  ) on conflict(id) do nothing;

  return new;
end;
$$;

drop trigger if exists capture_nodal_access_request_on_auth_user on auth.users;
create trigger capture_nodal_access_request_on_auth_user
after insert or update of last_sign_in_at, email on auth.users
for each row execute function public.capture_nodal_access_request();

-- Recupera las solicitudes del dia de activacion que llegaron a Auth pero no
-- habian creado perfil NODAL. No reactiva usuarios revocados ni toca perfiles
-- existentes.
insert into public.nodal_users(
  id, email, contact_email, display_name, access_state,
  authorized_at, revoked_at, created_at, updated_at
)
select
  users.id,
  lower(btrim(users.email)),
  lower(btrim(users.email)),
  coalesce(
    nullif(btrim(users.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(users.raw_user_meta_data ->> 'name'), '')
  ),
  'pending',
  null,
  null,
  users.created_at,
  now()
from auth.users users
where users.email is not null
  and greatest(users.created_at, coalesce(users.last_sign_in_at, users.created_at)) >=
    ((date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires'))
      at time zone 'America/Argentina/Buenos_Aires')
  and not exists(
    select 1 from public.nodal_users profiles where profiles.id = users.id
  )
on conflict(id) do nothing;

create or replace function public.admin_review_pending_nodal_user(
  target_user_id uuid,
  target_approved boolean,
  target_display_name text,
  target_period_month date,
  target_commission_bps integer,
  management_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  pending_user public.nodal_users%rowtype;
  provisioned record;
  root_desk constant uuid := '00000000-0000-4000-8000-000000000001';
begin
  if actor_id is null or not public.is_current_user_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if nullif(btrim(management_reason), '') is null then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into pending_user
  from public.nodal_users users
  where users.id = target_user_id and users.access_state = 'pending'
  for update;
  if pending_user.id is null then raise exception 'ACCESS_REQUEST_NOT_PENDING'; end if;

  if not target_approved then
    update public.nodal_users
    set access_state = 'revoked', revoked_at = now(), updated_at = now()
    where id = pending_user.id;

    insert into public.access_authorization_events(
      target_user_id, action, previous_state, current_state, performed_by, reason
    ) values (
      pending_user.id, 'revoked', 'pending', 'revoked', actor_id::text,
      btrim(management_reason)
    );
    return null;
  end if;

  if target_period_month is null
    or target_period_month <> date_trunc('month', target_period_month)::date then
    raise exception 'INVALID_PERIOD';
  end if;
  if target_commission_bps is null or target_commission_bps not between 0 and 10000 then
    raise exception 'INVALID_COMMISSION';
  end if;

  select * into provisioned
  from public.admin_authorize_and_provision_nodal_user(
    pending_user.email,
    coalesce(nullif(btrim(target_display_name), ''), pending_user.display_name),
    target_period_month,
    btrim(management_reason)
  );

  insert into public.nodal_user_terms(
    user_id, effective_month, desk_id, level, state, commission_bps, bonus_enabled
  ) values (
    provisioned.target_user_id, target_period_month, root_desk, 1, 'active',
    target_commission_bps, false
  ) on conflict(user_id, effective_month) do update set
    desk_id = excluded.desk_id,
    level = excluded.level,
    state = excluded.state,
    commission_bps = excluded.commission_bps,
    bonus_enabled = false;

  insert into public.nodal_management_history(
    user_id, desk_id, actor_id, effective_month, action, before_data, after_data
  ) values (
    provisioned.target_user_id, root_desk, actor_id, target_period_month,
    'direct_access_approved', to_jsonb(pending_user),
    jsonb_build_object(
      'access_state', 'active',
      'desk_id', root_desk,
      'commission_bps', target_commission_bps
    )
  );

  return provisioned.target_user_id;
end;
$$;

revoke all on function public.capture_nodal_access_request() from public, anon, authenticated;
revoke all on function public.admin_review_pending_nodal_user(uuid,boolean,text,date,integer,text)
from public, anon;
grant execute on function public.admin_review_pending_nodal_user(uuid,boolean,text,date,integer,text)
to authenticated;

comment on function public.capture_nodal_access_request() is
  'Crea de forma idempotente una solicitud pendiente al primer ingreso con Google.';
comment on function public.admin_review_pending_nodal_user(uuid,boolean,text,date,integer,text) is
  'Admin Master aprueba o rechaza una solicitud directa y asigna las aprobadas a la Mesa Principal.';
