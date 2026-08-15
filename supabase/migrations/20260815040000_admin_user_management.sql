-- Gestion administrativa auditable de alumnos.
-- Requiere que la persona se haya identificado primero con Google.

create function public.admin_authorize_and_provision_nodal_user(
  target_email text,
  target_display_name text,
  target_period_month date,
  management_reason text
)
returns table (target_user_id uuid, created_workspaces integer, created_periods integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_email text := lower(btrim(target_email));
  matched_auth_user record;
  prior_state public.nodal_access_state;
  inserted_workspaces integer := 0;
  inserted_periods integer := 0;
begin
  if actor_id is null or not public.is_current_user_admin() then
    raise exception 'administrator access is required';
  end if;
  if normalized_email = '' or btrim(management_reason) = '' then
    raise exception 'Email and reason are required';
  end if;
  if target_period_month is null
    or target_period_month <> date_trunc('month', target_period_month)::date then
    raise exception 'The period must use the first day of its month';
  end if;

  select users.id, lower(users.email) as email,
    nullif(btrim(users.raw_user_meta_data ->> 'full_name'), '') as google_name
  into matched_auth_user
  from auth.users as users
  where lower(users.email) = normalized_email;
  if not found then
    raise exception 'The person must sign in with Google before NODAL can authorize access';
  end if;

  select users.access_state into prior_state
  from public.nodal_users as users
  where users.id = matched_auth_user.id
  for update;

  insert into public.nodal_users (
    id, email, display_name, access_state, authorized_at, revoked_at
  ) values (
    matched_auth_user.id, matched_auth_user.email,
    coalesce(nullif(btrim(target_display_name), ''), matched_auth_user.google_name),
    'active', now(), null
  ) on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.nodal_users.display_name),
    access_state = 'active',
    authorized_at = case when public.nodal_users.access_state = 'active'
      then public.nodal_users.authorized_at else now() end,
    revoked_at = null;

  if prior_state is distinct from 'active'::public.nodal_access_state then
    insert into public.access_authorization_events (
      target_user_id, action, previous_state, current_state, performed_by, reason
    ) values (
      matched_auth_user.id, 'authorized', prior_state, 'active', actor_id::text, btrim(management_reason)
    );
  end if;

  insert into public.workspaces (owner_user_id, modality)
  values (matched_auth_user.id, 'real'), (matched_auth_user.id, 'practice')
  on conflict (owner_user_id, modality) do nothing;
  get diagnostics inserted_workspaces = row_count;

  insert into public.periods (workspace_id, period_month)
  select spaces.id, target_period_month
  from public.workspaces as spaces
  where spaces.owner_user_id = matched_auth_user.id
    and spaces.modality in ('real', 'practice')
  on conflict (workspace_id, period_month) do nothing;
  get diagnostics inserted_periods = row_count;

  if inserted_workspaces > 0 or inserted_periods > 0 then
    insert into public.workspace_provisioning_events (
      target_user_id, period_month, created_workspaces, created_periods, performed_by, reason
    ) values (
      matched_auth_user.id, target_period_month, inserted_workspaces, inserted_periods,
      actor_id::text, btrim(management_reason)
    );
  end if;

  return query select matched_auth_user.id, inserted_workspaces, inserted_periods;
end;
$$;

create function public.admin_revoke_nodal_student(
  target_user_id uuid,
  management_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  prior_state public.nodal_access_state;
  target_role public.nodal_access_role;
begin
  if actor_id is null or not public.is_current_user_admin() then
    raise exception 'administrator access is required';
  end if;
  if btrim(management_reason) = '' then
    raise exception 'A reason is required';
  end if;
  if target_user_id = actor_id then
    raise exception 'An administrator cannot revoke their own access';
  end if;

  select users.access_state, users.access_role into prior_state, target_role
  from public.nodal_users as users where users.id = target_user_id for update;
  if not found then raise exception 'NODAL user does not exist'; end if;
  if target_role <> 'student' then
    raise exception 'Only student access can be revoked from this panel';
  end if;

  if prior_state is distinct from 'revoked'::public.nodal_access_state then
    update public.nodal_users set access_state = 'revoked', revoked_at = now()
    where id = target_user_id;
    insert into public.access_authorization_events (
      target_user_id, action, previous_state, current_state, performed_by, reason
    ) values (
      target_user_id, 'revoked', prior_state, 'revoked', actor_id::text, btrim(management_reason)
    );
  end if;
end;
$$;

revoke all on function public.admin_authorize_and_provision_nodal_user(text, text, date, text) from public, anon;
revoke all on function public.admin_revoke_nodal_student(uuid, text) from public, anon;
grant execute on function public.admin_authorize_and_provision_nodal_user(text, text, date, text) to authenticated;
grant execute on function public.admin_revoke_nodal_student(uuid, text) to authenticated;
