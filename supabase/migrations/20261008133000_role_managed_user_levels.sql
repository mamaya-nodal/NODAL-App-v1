-- APP-171: levels follow the user's effective role deterministically.
-- Usuario = 1, Admin = 2, Admin Master (global + desk) = 3.

create or replace function public.admin_update_nodal_user_role(
  target_user_id uuid,
  target_role text,
  target_admin_bps integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  month date := public.nodal_accounting_period_month(now());
  wants_desk_admin boolean := target_role in ('admin', 'admin_master');
  wants_master boolean := target_role = 'admin_master';
  target_level integer := case target_role
    when 'user' then 1
    when 'admin' then 2
    when 'admin_master' then 3
    else null
  end;
  old_user public.nodal_users%rowtype;
  old_terms public.nodal_user_terms%rowtype;
  managed_desk uuid;
  old_desk_terms public.nodal_desk_terms%rowtype;
  has_dependencies boolean := false;
  before_data jsonb;
  after_data jsonb;
begin
  if actor_id is null or not public.is_current_user_admin() then
    raise exception 'ADMIN_MASTER_REQUIRED';
  end if;
  if target_level is null then raise exception 'INVALID_ROLE'; end if;
  if wants_desk_admin and (target_admin_bps is null or target_admin_bps not between 0 and 10000) then
    raise exception 'INVALID_PERCENTAGE';
  end if;

  perform pg_advisory_xact_lock(9080701);

  select * into old_user
  from public.nodal_users
  where id = target_user_id
  for update;
  if old_user.id is null or old_user.access_state <> 'active' then
    raise exception 'USER_NOT_ACTIVE';
  end if;

  select * into old_terms
  from public.nodal_user_terms
  where user_id = target_user_id and effective_month <= month
  order by effective_month desc
  limit 1;
  if old_terms.user_id is null then raise exception 'USER_TERMS_NOT_FOUND'; end if;

  managed_desk := public.nodal_user_managed_desk_id(target_user_id, month);
  if managed_desk is not null then
    select * into old_desk_terms
    from public.nodal_desk_terms
    where desk_id = managed_desk and effective_month <= month
    order by effective_month desc
    limit 1;
  end if;

  before_data := jsonb_build_object(
    'access_role', old_user.access_role,
    'managed_desk_id', managed_desk,
    'admin_bps', case when managed_desk is null then null else old_desk_terms.nodal_bps end,
    'user_terms', to_jsonb(old_terms)
  );

  if target_user_id = actor_id and not wants_master then
    raise exception 'SELF_MASTER_REMOVAL_FORBIDDEN';
  end if;

  if old_user.access_role = 'admin' and not wants_master and not exists (
    select 1 from public.nodal_users
    where id <> target_user_id and access_state = 'active' and access_role = 'admin'
  ) then
    raise exception 'LAST_MASTER_REQUIRED';
  end if;

  if wants_desk_admin and managed_desk is null then
    insert into public.nodal_desks(name, parent_id)
    values(
      'Mesa de ' || coalesce(nullif(btrim(old_user.display_name), ''), old_user.email),
      old_terms.desk_id
    )
    returning id into managed_desk;
  end if;

  if wants_desk_admin then
    insert into public.nodal_desk_terms(
      desk_id, effective_month, manager_id, nodal_bps, active
    ) values (
      managed_desk, month, target_user_id, target_admin_bps, true
    )
    on conflict(desk_id, effective_month) do update set
      manager_id = excluded.manager_id,
      nodal_bps = excluded.nodal_bps,
      active = true;

    insert into public.nodal_user_terms(
      user_id, effective_month, desk_id, level, state, commission_bps, bonus_enabled
    ) values (
      target_user_id, month, old_terms.desk_id, target_level,
      old_terms.state, old_terms.commission_bps, false
    )
    on conflict(user_id, effective_month) do update set
      level = target_level,
      bonus_enabled = false;
  elsif managed_desk is not null then
    has_dependencies := exists (
      select 1
      from (
        select distinct on(user_id) user_id, desk_id, state
        from public.nodal_user_terms
        where effective_month <= month
        order by user_id, effective_month desc
      ) terms
      join public.nodal_users users on users.id = terms.user_id and users.access_state = 'active'
      where terms.desk_id = managed_desk
        and terms.user_id <> target_user_id
        and terms.state <> 'inactive'
    ) or exists (
      select 1
      from public.nodal_desks child
      join lateral (
        select active
        from public.nodal_desk_terms
        where desk_id = child.id and effective_month <= month
        order by effective_month desc
        limit 1
      ) child_terms on child_terms.active
      where child.parent_id = managed_desk
    );
    if has_dependencies then raise exception 'ADMIN_HAS_DEPENDENCIES'; end if;

    insert into public.nodal_desk_terms(
      desk_id, effective_month, manager_id, nodal_bps, active
    ) values (
      managed_desk, month, target_user_id, old_desk_terms.nodal_bps, false
    )
    on conflict(desk_id, effective_month) do update set active = false;

    insert into public.nodal_user_terms(
      user_id, effective_month, desk_id, level, state, commission_bps, bonus_enabled
    ) values (
      target_user_id, month, old_terms.desk_id, target_level,
      old_terms.state, old_terms.commission_bps, false
    )
    on conflict(user_id, effective_month) do update set
      level = target_level,
      bonus_enabled = false;
  else
    insert into public.nodal_user_terms(
      user_id, effective_month, desk_id, level, state, commission_bps, bonus_enabled
    ) values (
      target_user_id, month, old_terms.desk_id, target_level,
      old_terms.state, old_terms.commission_bps, false
    )
    on conflict(user_id, effective_month) do update set
      level = target_level,
      bonus_enabled = false;
  end if;

  update public.nodal_users
  set access_role = case when wants_master then 'admin'::public.nodal_access_role else 'student'::public.nodal_access_role end
  where id = target_user_id;

  after_data := jsonb_build_object(
    'selected_role', target_role,
    'level', target_level,
    'access_role', case when wants_master then 'admin' else 'student' end,
    'managed_desk_id', managed_desk,
    'admin_bps', case when wants_desk_admin then target_admin_bps else null end
  );

  insert into public.nodal_management_history(
    user_id, desk_id, actor_id, effective_month, action, before_data, after_data
  ) values (
    target_user_id, old_terms.desk_id, actor_id, month,
    'admin_master_role_updated', before_data, after_data
  );
end;
$$;

comment on function public.admin_update_nodal_user_role(uuid,text,integer) is
  'Atomically maps Usuario/Admin/Admin Master to levels 1/2/3, updates desk capabilities, and preserves audit history.';
