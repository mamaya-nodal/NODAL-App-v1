-- APP-148: elimina el bonus automático por cantidad de mesas.
-- La columna histórica se conserva para no reescribir períodos cerrados, pero
-- deja de aceptar valores activos y ya no genera eventos bonus_threshold.

comment on column public.nodal_user_terms.bonus_enabled is
  'Campo histórico. El bonus automático por cantidad de mesas dejó de regir desde APP-148.';

create or replace function public.nodal_desk_terms_window_open(
  reference_at timestamptz default now()
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select reference_at >= public.nodal_period_close_at(
      (public.nodal_accounting_period_month(reference_at) - interval '1 month')::date
    )
    and reference_at < public.nodal_period_close_at(
      (public.nodal_accounting_period_month(reference_at) - interval '1 month')::date
    ) + interval '48 hours';
$$;

comment on function public.nodal_desk_terms_window_open(timestamptz) is
  'Ventana de 48 horas posterior al cierre. No modifica la apertura automática del período siguiente.';

revoke all on function public.nodal_desk_terms_window_open(timestamptz) from public, anon;
grant execute on function public.nodal_desk_terms_window_open(timestamptz) to authenticated;

create or replace function public.admin_save_user_terms(
  p_user uuid,
  p_month date,
  p_desk uuid,
  p_level integer,
  p_state text,
  p_commission integer,
  p_bonus boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb;
  new_row jsonb;
  current_month date := public.nodal_accounting_period_month(now());
begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_month is null or p_month <> current_month or extract(day from p_month) <> 1 then
    raise exception 'INVALID_EFFECTIVE_MONTH';
  end if;

  perform pg_advisory_xact_lock(9080701);

  if not exists (
    select 1 from public.nodal_users where id = p_user and access_state = 'active'
  ) then raise exception 'USER_NOT_ACTIVE'; end if;

  if not coalesce((
    select active
    from public.nodal_desk_terms
    where desk_id = p_desk and effective_month <= p_month
    order by effective_month desc
    limit 1
  ), false) then raise exception 'DESK_NOT_ACTIVE'; end if;

  select to_jsonb(terms)
  into old_row
  from public.nodal_user_terms terms
  where user_id = p_user and effective_month <= p_month
  order by effective_month desc
  limit 1;

  insert into public.nodal_user_terms(
    user_id,
    effective_month,
    desk_id,
    level,
    state,
    commission_bps,
    bonus_enabled
  ) values (
    p_user,
    p_month,
    p_desk,
    p_level,
    p_state,
    p_commission,
    false
  )
  on conflict(user_id, effective_month) do update
  set desk_id = excluded.desk_id,
      level = excluded.level,
      state = excluded.state,
      commission_bps = excluded.commission_bps,
      bonus_enabled = false;

  select to_jsonb(terms)
  into new_row
  from public.nodal_user_terms terms
  where user_id = p_user and effective_month = p_month;

  if old_row is distinct from new_row then
    insert into public.nodal_management_history(
      user_id,
      desk_id,
      actor_id,
      effective_month,
      action,
      before_data,
      after_data
    ) values (
      p_user,
      p_desk,
      auth.uid(),
      p_month,
      'user_terms',
      old_row,
      new_row
    );
  end if;
end;
$$;

create or replace function public.admin_save_desk(
  p_id uuid,
  p_name text,
  p_parent uuid,
  p_manager uuid,
  p_month date,
  p_nodal integer,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := p_id;
  old_row jsonb;
  new_row jsonb;
  current_month date := public.nodal_accounting_period_month(now());
  manager_level integer;
  origin uuid;
begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_month is null or p_month <> current_month or extract(day from p_month) <> 1 then
    raise exception 'INVALID_EFFECTIVE_MONTH';
  end if;

  perform pg_advisory_xact_lock(9080701);

  if p_manager is null or not exists (
    select 1 from public.nodal_users where id = p_manager and access_state = 'active'
  ) then raise exception 'USER_NOT_ACTIVE'; end if;

  origin := case
    when target is null then p_parent
    else (select parent_id from public.nodal_desks where id = target)
  end;

  if p_active and not coalesce((
    select active
    from public.nodal_desk_terms
    where desk_id = origin and effective_month <= p_month
    order by effective_month desc
    limit 1
  ), false) then raise exception 'DESK_NOT_ACTIVE'; end if;

  select level
  into manager_level
  from public.nodal_user_terms
  where user_id = p_manager and effective_month <= p_month
  order by effective_month desc
  limit 1;

  if coalesce(manager_level, 1) < 2 then raise exception 'LEVEL_TWO_REQUIRED'; end if;

  if exists (
    select 1
    from (
      select distinct on(desk_id) *
      from public.nodal_desk_terms
      where effective_month <= p_month
      order by desk_id, effective_month desc
    ) terms
    where manager_id = p_manager and active and desk_id is distinct from target
  ) then raise exception 'ALREADY_MANAGES_DESK'; end if;

  if target is null then
    if not coalesce((
      select active
      from public.nodal_desk_terms
      where desk_id = p_parent and effective_month <= p_month
      order by effective_month desc
      limit 1
    ), false) then raise exception 'DESK_NOT_ACTIVE'; end if;

    insert into public.nodal_desks(name, parent_id)
    values(p_name, p_parent)
    returning id into target;
  else
    if not exists (
      select 1 from public.nodal_desks where id = target and parent_id is not null
    ) then raise exception 'INVALID_DESK'; end if;

    select to_jsonb(terms)
    into old_row
    from public.nodal_desk_terms terms
    where desk_id = target and effective_month <= p_month
    order by effective_month desc
    limit 1;
  end if;

  if not p_active and (
    exists (
      select 1
      from (
        select distinct on(user_id) *
        from public.nodal_user_terms
        where effective_month <= p_month
        order by user_id, effective_month desc
      ) terms
      where desk_id = target
    )
    or exists (
      select 1
      from public.nodal_desks desks
      join lateral (
        select active
        from public.nodal_desk_terms
        where desk_id = desks.id and effective_month <= p_month
        order by effective_month desc
        limit 1
      ) terms on terms.active
      where desks.parent_id = target
    )
  ) then raise exception 'DESK_HAS_MEMBERS'; end if;

  insert into public.nodal_desk_terms(
    desk_id,
    effective_month,
    manager_id,
    nodal_bps,
    active
  ) values (
    target,
    p_month,
    p_manager,
    p_nodal,
    p_active
  )
  on conflict(desk_id, effective_month) do update
  set manager_id = excluded.manager_id,
      nodal_bps = excluded.nodal_bps,
      active = excluded.active;

  select to_jsonb(terms)
  into new_row
  from public.nodal_desk_terms terms
  where desk_id = target and effective_month = p_month;

  insert into public.nodal_management_history(
    user_id,
    desk_id,
    actor_id,
    effective_month,
    action,
    before_data,
    after_data
  ) values (
    p_manager,
    target,
    auth.uid(),
    p_month,
    'desk_terms',
    old_row,
    new_row
  );

  if old_row->>'manager_id' is not null and old_row->>'manager_id' <> p_manager::text then
    insert into public.nodal_management_history(
      user_id,
      desk_id,
      actor_id,
      effective_month,
      action,
      before_data,
      after_data
    ) values (
      (old_row->>'manager_id')::uuid,
      target,
      auth.uid(),
      p_month,
      'manager_replaced',
      old_row,
      new_row
    );
  end if;

  return target;
end;
$$;

