-- Identificadores visibles del Sistema NODAL y movimientos atomicos de
-- usuarios/mesas. Los UUID tecnicos y el historial economico no cambian.

create table public.nodal_units (
  id uuid primary key default gen_random_uuid(),
  ordinal integer not null unique check (ordinal > 0),
  name text not null check (length(btrim(name)) between 1 and 80),
  code text not null unique check (code ~ '^[A-Z]{2}$'),
  root_desk_id uuid not null unique references public.nodal_desks(id) on delete restrict,
  next_desk_number integer not null default 1 check (next_desk_number > 0),
  created_at timestamptz not null default now()
);

insert into public.nodal_units(id, ordinal, name, code, root_desk_id)
values (
  '00000000-0000-4000-8000-000000000101', 1, 'Unidad NODAL', 'ND',
  '00000000-0000-4000-8000-000000000001'
);

alter table public.nodal_desks
  add column unit_id uuid references public.nodal_units(id) on delete restrict,
  add column display_code text;

update public.nodal_desks
set unit_id = '00000000-0000-4000-8000-000000000101', display_code = 'MP'
where id = '00000000-0000-4000-8000-000000000001';

with numbered as (
  select id, row_number() over(order by created_at, id) as sequence
  from public.nodal_desks
  where id <> '00000000-0000-4000-8000-000000000001'
)
update public.nodal_desks desks
set unit_id = '00000000-0000-4000-8000-000000000101',
    display_code = 'M' || lpad(numbered.sequence::text, 2, '0')
from numbered
where desks.id = numbered.id;

update public.nodal_units units
set next_desk_number = coalesce((
  select max(substring(desks.display_code from 2)::integer) + 1
  from public.nodal_desks desks
  where desks.unit_id = units.id and desks.display_code ~ '^M[0-9]+$'
), 1);

alter table public.nodal_desks
  alter column unit_id set not null,
  alter column display_code set not null,
  add constraint nodal_desks_display_code_valid check (display_code = 'MP' or display_code ~ '^M[0-9]{2,}$'),
  add constraint nodal_desks_unit_code_unique unique(unit_id, display_code);

create or replace function public.assign_nodal_desk_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inherited_unit uuid;
  next_number integer;
begin
  if new.parent_id is null then
    if new.unit_id is null or new.display_code is distinct from 'MP' then
      raise exception 'ROOT_DESK_IDENTITY_REQUIRED';
    end if;
    return new;
  end if;

  select unit_id into inherited_unit from public.nodal_desks where id = new.parent_id;
  if inherited_unit is null then raise exception 'PARENT_DESK_NOT_FOUND'; end if;
  if new.unit_id is not null and new.unit_id <> inherited_unit then raise exception 'CROSS_UNIT_DESK_MOVE'; end if;
  new.unit_id := inherited_unit;

  if new.display_code is null then
    select next_desk_number into next_number
    from public.nodal_units where id = inherited_unit for update;
    if next_number is null then raise exception 'UNIT_NOT_FOUND'; end if;
    new.display_code := 'M' || lpad(next_number::text, 2, '0');
    update public.nodal_units set next_desk_number = next_number + 1 where id = inherited_unit;
  end if;
  return new;
end;
$$;

create trigger nodal_desks_assign_identity
before insert on public.nodal_desks
for each row execute function public.assign_nodal_desk_identity();

create table public.nodal_user_identifiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.nodal_users(id) on delete restrict,
  unit_id uuid not null references public.nodal_units(id) on delete restrict,
  desk_id uuid not null references public.nodal_desks(id) on delete restrict,
  display_id text not null unique check (display_id ~ '^USER[A-Z]{2}-(MP|M[0-9]{2,})-[0-9]{2,}$'),
  member_number integer not null check (member_number > 0),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  reason text not null check (length(btrim(reason)) between 1 and 120),
  assigned_by uuid references public.nodal_users(id) on delete restrict,
  constraint nodal_user_identifier_period_valid check (valid_to is null or valid_to >= valid_from),
  constraint nodal_user_identifier_sequence_unique unique(desk_id, member_number)
);

create unique index nodal_user_identifiers_one_current
on public.nodal_user_identifiers(user_id) where valid_to is null;
create index nodal_user_identifiers_user_history_idx
on public.nodal_user_identifiers(user_id, valid_from desc);

create or replace function public.nodal_refresh_user_identifier(
  target_user_id uuid,
  target_desk_id uuid,
  assignment_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_identifier public.nodal_user_identifiers%rowtype;
  unit_code text;
  desk_code text;
  desk_unit uuid;
  next_number integer;
  next_display_id text;
  actor_id uuid := auth.uid();
begin
  if nullif(btrim(assignment_reason), '') is null then raise exception 'IDENTIFIER_REASON_REQUIRED'; end if;
  if not exists(select 1 from public.nodal_users where id = target_user_id) then raise exception 'USER_NOT_FOUND'; end if;

  select desks.unit_id, desks.display_code, units.code
  into desk_unit, desk_code, unit_code
  from public.nodal_desks desks
  join public.nodal_units units on units.id = desks.unit_id
  where desks.id = target_desk_id;
  if desk_unit is null then raise exception 'DESK_NOT_FOUND'; end if;

  select * into current_identifier
  from public.nodal_user_identifiers
  where user_id = target_user_id and valid_to is null
  for update;
  if current_identifier.id is not null and current_identifier.desk_id = target_desk_id then
    return current_identifier.display_id;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nodal-user-identifier:' || target_desk_id::text, 0)
  );
  select coalesce(max(member_number), 0) + 1 into next_number
  from public.nodal_user_identifiers where desk_id = target_desk_id;
  next_display_id := 'USER' || unit_code || '-' || desk_code || '-' || lpad(next_number::text, 2, '0');

  if current_identifier.id is not null then
    update public.nodal_user_identifiers set valid_to = clock_timestamp()
    where id = current_identifier.id;
  end if;
  insert into public.nodal_user_identifiers(
    user_id, unit_id, desk_id, display_id, member_number, reason, assigned_by
  ) values (
    target_user_id, desk_unit, target_desk_id, next_display_id, next_number,
    btrim(assignment_reason), actor_id
  );

  if actor_id is not null then
    insert into public.nodal_management_history(
      user_id, desk_id, actor_id, effective_month, action, before_data, after_data
    ) values (
      target_user_id, target_desk_id, actor_id, public.nodal_accounting_period_month(now()),
      'user_identifier_assigned',
      case when current_identifier.id is null then null else to_jsonb(current_identifier) end,
      jsonb_build_object('display_id', next_display_id, 'desk_id', target_desk_id, 'reason', btrim(assignment_reason))
    );
  end if;
  return next_display_id;
end;
$$;

create or replace function public.sync_nodal_user_identifier_from_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_month date := public.nodal_accounting_period_month(now());
  latest_desk uuid;
begin
  if new.effective_month > current_month then return new; end if;
  select desk_id into latest_desk
  from public.nodal_user_terms
  where user_id = new.user_id and effective_month <= current_month
  order by effective_month desc limit 1;
  if latest_desk = new.desk_id and tg_op = 'INSERT' then
    perform public.nodal_refresh_user_identifier(new.user_id, new.desk_id, 'Alta en mesa vigente');
  elsif latest_desk = new.desk_id and old.desk_id is distinct from new.desk_id then
    perform public.nodal_refresh_user_identifier(new.user_id, new.desk_id, 'Cambio de mesa vigente');
  end if;
  return new;
end;
$$;

create trigger nodal_user_terms_sync_identifier
after insert or update of desk_id on public.nodal_user_terms
for each row execute function public.sync_nodal_user_identifier_from_terms();

do $$
declare
  membership record;
begin
  for membership in
    select current_terms.user_id, current_terms.desk_id
    from (
      select distinct on (terms.user_id) terms.user_id, terms.desk_id, terms.effective_month
      from public.nodal_user_terms terms
      where terms.effective_month <= public.nodal_accounting_period_month(now())
      order by terms.user_id, terms.effective_month desc
    ) current_terms
    join public.nodal_users users on users.id = current_terms.user_id
    join public.nodal_desks desks on desks.id = current_terms.desk_id
    order by desks.unit_id, desks.display_code, users.created_at, users.id
  loop
    perform public.nodal_refresh_user_identifier(
      membership.user_id, membership.desk_id, 'Asignacion inicial desde estructura existente'
    );
  end loop;
end;
$$;

create or replace function public.nodal_desk_is_descendant(
  candidate_desk_id uuid,
  ancestor_desk_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive descendants(id) as (
    select ancestor_desk_id
    union all
    select desks.id from public.nodal_desks desks join descendants on desks.parent_id = descendants.id
  )
  select exists(select 1 from descendants where id = candidate_desk_id);
$$;

create or replace function public.nodal_user_managed_desk_id(
  target_user_id uuid,
  reference_month date
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select latest.desk_id
  from (
    select distinct on (terms.desk_id)
      terms.desk_id, terms.manager_id, terms.active, terms.effective_month
    from public.nodal_desk_terms terms
    where terms.effective_month <= reference_month
    order by terms.desk_id, terms.effective_month desc
  ) latest
  where latest.manager_id = target_user_id and latest.active
  order by latest.desk_id
  limit 1;
$$;

create or replace function public.desk_admin_save_user_v2(
  target_user_id uuid,
  target_state text,
  target_contact_email text,
  target_identities_enabled boolean,
  target_commission_bps integer,
  target_is_admin boolean,
  target_admin_bps integer,
  target_assigned_user_ids uuid[],
  target_membership_desk_id uuid,
  target_dependency_destination_desk_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  month date := public.nodal_accounting_period_month(now());
  actor_desk uuid := public.nodal_actor_managed_desk();
  actor_parent uuid;
  old_terms public.nodal_user_terms%rowtype;
  target_desk uuid;
  managed_desk uuid;
  managed_parent uuid;
  prior_desk_terms public.nodal_desk_terms%rowtype;
  candidate uuid;
  candidate_terms public.nodal_user_terms%rowtype;
  candidate_managed_desk uuid;
  dependency_destination uuid;
  old_user jsonb;
  new_user jsonb;
  old_parent uuid;
  normalized_contact text := nullif(lower(btrim(target_contact_email)), '');
  percentages_changed boolean := false;
  has_dependencies boolean := false;
begin
  if actor_id is null or actor_desk is null then raise exception 'DESK_ADMIN_REQUIRED'; end if;
  if target_user_id = actor_id and not public.is_current_user_admin() then raise exception 'SELF_EDIT_FORBIDDEN'; end if;
  if target_state not in ('active', 'paused', 'inactive') then raise exception 'INVALID_STATE'; end if;
  if target_commission_bps is null or target_commission_bps not between 0 and 10000
    or (target_is_admin and (target_admin_bps is null or target_admin_bps not between 0 and 10000)) then
    raise exception 'INVALID_PERCENTAGE';
  end if;
  if normalized_contact is not null and normalized_contact !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'INVALID_CONTACT_EMAIL';
  end if;
  perform pg_advisory_xact_lock(9080701);

  select parent_id into actor_parent from public.nodal_desks where id = actor_desk;
  select * into old_terms from public.nodal_user_terms
  where user_id = target_user_id and effective_month <= month
  order by effective_month desc limit 1;
  if old_terms.user_id is null or not public.nodal_actor_can_manage_desk(old_terms.desk_id) then
    raise exception 'TARGET_OUTSIDE_BRANCH';
  end if;
  target_desk := coalesce(target_membership_desk_id, old_terms.desk_id);
  if not public.nodal_actor_can_manage_desk(target_desk) and target_desk is distinct from actor_parent then
    raise exception 'DESTINATION_OUTSIDE_BRANCH';
  end if;
  if not coalesce((
    select active from public.nodal_desk_terms
    where desk_id = target_desk and effective_month <= month
    order by effective_month desc limit 1
  ), false) then raise exception 'DESTINATION_DESK_INACTIVE'; end if;

  managed_desk := public.nodal_user_managed_desk_id(target_user_id, month);
  if managed_desk is not null then
    select * into prior_desk_terms from public.nodal_desk_terms
    where desk_id = managed_desk and effective_month <= month
    order by effective_month desc limit 1;
    select parent_id into managed_parent from public.nodal_desks where id = managed_desk;
  end if;

  if old_terms.desk_id is distinct from target_desk and managed_desk is not null then
    if public.nodal_desk_is_descendant(target_desk, managed_desk) then raise exception 'DESK_MOVE_CYCLE'; end if;
    old_parent := managed_parent;
    update public.nodal_desks set parent_id = target_desk where id = managed_desk;
    managed_parent := target_desk;
    insert into public.nodal_management_history(user_id, desk_id, actor_id, effective_month, action, before_data, after_data)
    values(target_user_id, managed_desk, actor_id, month, 'managed_desk_reassigned',
      jsonb_build_object('parent_id', old_parent), jsonb_build_object('parent_id', target_desk));
  end if;

  percentages_changed := old_terms.commission_bps is distinct from target_commission_bps
    or (target_is_admin and prior_desk_terms.nodal_bps is distinct from target_admin_bps);
  if percentages_changed and not public.is_current_user_admin()
    and not public.nodal_desk_terms_window_open(now()) then
    raise exception 'PERCENTAGE_WINDOW_CLOSED';
  end if;

  select to_jsonb(users) into old_user from public.nodal_users users where id = target_user_id for update;
  if old_user is null then raise exception 'USER_NOT_FOUND'; end if;
  update public.nodal_users set
    contact_email = normalized_contact,
    identities_enabled = target_identities_enabled,
    access_state = case when target_state = 'inactive' then 'revoked'::public.nodal_access_state else 'active'::public.nodal_access_state end,
    revoked_at = case when target_state = 'inactive' then coalesce(revoked_at, now()) else null end,
    authorized_at = case when target_state <> 'inactive' then coalesce(authorized_at, now()) else authorized_at end
  where id = target_user_id;

  if target_is_admin and managed_desk is null then
    if not public.is_current_user_admin() and not public.nodal_desk_terms_window_open(now()) then
      raise exception 'PERCENTAGE_WINDOW_CLOSED';
    end if;
    insert into public.nodal_desks(name, parent_id)
    select 'Mesa de ' || coalesce(nullif(btrim(display_name), ''), email), target_desk
    from public.nodal_users where id = target_user_id
    returning id into managed_desk;
    managed_parent := target_desk;
  end if;

  if target_is_admin then
    insert into public.nodal_desk_terms(desk_id, effective_month, manager_id, nodal_bps, active)
    values(managed_desk, month, target_user_id, target_admin_bps, true)
    on conflict(desk_id, effective_month) do update set
      manager_id = excluded.manager_id, nodal_bps = excluded.nodal_bps, active = true;

    foreach candidate in array coalesce(target_assigned_user_ids, '{}') loop
      if candidate = target_user_id or candidate = actor_id then raise exception 'INVALID_ASSIGNMENT'; end if;
      select * into candidate_terms from public.nodal_user_terms
      where user_id = candidate and effective_month <= month order by effective_month desc limit 1;
      if candidate_terms.user_id is null or not public.nodal_actor_can_manage_desk(candidate_terms.desk_id) then
        raise exception 'ASSIGNEE_OUTSIDE_BRANCH';
      end if;
      candidate_managed_desk := public.nodal_user_managed_desk_id(candidate, month);
      if candidate_managed_desk is not null then
        if candidate_managed_desk = managed_desk
          or public.nodal_desk_is_descendant(managed_desk, candidate_managed_desk) then
          raise exception 'DESK_MOVE_CYCLE';
        end if;
        update public.nodal_desks set parent_id = managed_desk where id = candidate_managed_desk;
      end if;
      insert into public.nodal_user_terms(user_id, effective_month, desk_id, level, state, commission_bps, bonus_enabled)
      values(candidate, month, managed_desk, candidate_terms.level, candidate_terms.state, candidate_terms.commission_bps, false)
      on conflict(user_id, effective_month) do update set desk_id = excluded.desk_id, bonus_enabled = false;
      insert into public.nodal_management_history(user_id, desk_id, actor_id, effective_month, action, before_data, after_data)
      values(candidate, managed_desk, actor_id, month,
        case when candidate_managed_desk is null then 'user_reassigned' else 'user_structure_reassigned' end,
        to_jsonb(candidate_terms), jsonb_build_object('desk_id', managed_desk, 'managed_desk_id', candidate_managed_desk));
    end loop;

    for candidate in
      select terms.user_id from (
        select distinct on(user_id) * from public.nodal_user_terms
        where effective_month <= month order by user_id, effective_month desc
      ) terms
      where terms.desk_id = managed_desk
        and terms.user_id <> target_user_id
        and not (terms.user_id = any(coalesce(target_assigned_user_ids, '{}')))
    loop
      select * into candidate_terms from public.nodal_user_terms
      where user_id = candidate and effective_month <= month order by effective_month desc limit 1;
      candidate_managed_desk := public.nodal_user_managed_desk_id(candidate, month);
      if candidate_managed_desk is not null then
        update public.nodal_desks set parent_id = managed_parent where id = candidate_managed_desk;
      end if;
      insert into public.nodal_user_terms(user_id, effective_month, desk_id, level, state, commission_bps, bonus_enabled)
      values(candidate, month, managed_parent, candidate_terms.level, candidate_terms.state, candidate_terms.commission_bps, false)
      on conflict(user_id, effective_month) do update set desk_id = excluded.desk_id, bonus_enabled = false;
      insert into public.nodal_management_history(user_id, desk_id, actor_id, effective_month, action, before_data, after_data)
      values(candidate, managed_parent, actor_id, month,
        case when candidate_managed_desk is null then 'user_reassigned' else 'user_structure_reassigned' end,
        to_jsonb(candidate_terms), jsonb_build_object('desk_id', managed_parent, 'managed_desk_id', candidate_managed_desk));
    end loop;
  elsif managed_desk is not null then
    has_dependencies := exists(
      select 1 from (
        select distinct on(user_id) * from public.nodal_user_terms
        where effective_month <= month order by user_id, effective_month desc
      ) terms where terms.desk_id = managed_desk and terms.user_id <> target_user_id
    ) or exists(
      select 1 from public.nodal_desks child
      join lateral (
        select active from public.nodal_desk_terms
        where desk_id = child.id and effective_month <= month
        order by effective_month desc limit 1
      ) child_terms on child_terms.active
      where child.parent_id = managed_desk
    );
    dependency_destination := coalesce(target_dependency_destination_desk_id, managed_parent);
    if has_dependencies and target_dependency_destination_desk_id is null then
      raise exception 'DEPENDENCY_DESTINATION_REQUIRED';
    end if;
    if public.nodal_desk_is_descendant(dependency_destination, managed_desk) then
      raise exception 'DESK_MOVE_CYCLE';
    end if;
    if not public.nodal_actor_can_manage_desk(dependency_destination)
      and dependency_destination is distinct from actor_parent then
      raise exception 'DESTINATION_OUTSIDE_BRANCH';
    end if;
    if not coalesce((
      select active from public.nodal_desk_terms
      where desk_id = dependency_destination and effective_month <= month
      order by effective_month desc limit 1
    ), false) then raise exception 'DESTINATION_DESK_INACTIVE'; end if;

    for candidate in
      select terms.user_id from (
        select distinct on(user_id) * from public.nodal_user_terms
        where effective_month <= month order by user_id, effective_month desc
      ) terms where terms.desk_id = managed_desk and terms.user_id <> target_user_id
    loop
      select * into candidate_terms from public.nodal_user_terms
      where user_id = candidate and effective_month <= month order by effective_month desc limit 1;
      candidate_managed_desk := public.nodal_user_managed_desk_id(candidate, month);
      if candidate_managed_desk is not null then
        update public.nodal_desks set parent_id = dependency_destination where id = candidate_managed_desk;
      end if;
      insert into public.nodal_user_terms(user_id, effective_month, desk_id, level, state, commission_bps, bonus_enabled)
      values(candidate, month, dependency_destination, candidate_terms.level, candidate_terms.state, candidate_terms.commission_bps, false)
      on conflict(user_id, effective_month) do update set desk_id = excluded.desk_id, bonus_enabled = false;
      insert into public.nodal_management_history(user_id, desk_id, actor_id, effective_month, action, before_data, after_data)
      values(candidate, dependency_destination, actor_id, month, 'dependency_reassigned_before_admin_removal',
        to_jsonb(candidate_terms), jsonb_build_object('desk_id', dependency_destination, 'managed_desk_id', candidate_managed_desk));
    end loop;

    update public.nodal_desks set parent_id = dependency_destination
    where parent_id = managed_desk;
    insert into public.nodal_desk_terms(desk_id, effective_month, manager_id, nodal_bps, active)
    values(managed_desk, month, target_user_id, prior_desk_terms.nodal_bps, false)
    on conflict(desk_id, effective_month) do update set active = false;
    insert into public.nodal_management_history(user_id, desk_id, actor_id, effective_month, action, before_data, after_data)
    values(target_user_id, managed_desk, actor_id, month, 'admin_dependencies_reassigned',
      jsonb_build_object('parent_id', managed_parent, 'active', true),
      jsonb_build_object('destination_desk_id', dependency_destination, 'active', false));
  end if;

  insert into public.nodal_user_terms(user_id, effective_month, desk_id, level, state, commission_bps, bonus_enabled)
  values(target_user_id, month, target_desk,
    case when target_is_admin then greatest(old_terms.level, 2) else old_terms.level end,
    target_state, target_commission_bps, false)
  on conflict(user_id, effective_month) do update set
    desk_id = excluded.desk_id, state = excluded.state,
    commission_bps = excluded.commission_bps, level = excluded.level, bonus_enabled = false;

  select to_jsonb(users) into new_user from public.nodal_users users where id = target_user_id;
  insert into public.nodal_management_history(user_id, desk_id, actor_id, effective_month, action, before_data, after_data)
  values(target_user_id, target_desk, actor_id, month, 'desk_admin_user_updated_v2',
    jsonb_build_object('user', old_user, 'terms', to_jsonb(old_terms), 'desk_terms', to_jsonb(prior_desk_terms)),
    jsonb_build_object('user', new_user, 'state', target_state, 'commission_bps', target_commission_bps,
      'is_admin', target_is_admin, 'admin_bps', target_admin_bps,
      'membership_desk_id', target_desk,
      'dependency_destination_desk_id', target_dependency_destination_desk_id,
      'assigned_user_ids', coalesce(to_jsonb(target_assigned_user_ids), '[]'::jsonb)));
end;
$$;

alter table public.nodal_units enable row level security;
alter table public.nodal_user_identifiers enable row level security;
revoke all on table public.nodal_units, public.nodal_user_identifiers from public, anon, authenticated;
grant select on table public.nodal_units, public.nodal_user_identifiers to authenticated;

create policy nodal_units_authenticated_read on public.nodal_units
for select to authenticated using (true);
create policy nodal_user_identifiers_scoped_read on public.nodal_user_identifiers
for select to authenticated using (
  user_id = auth.uid() or public.is_current_user_admin() or public.nodal_actor_can_manage_desk(desk_id)
);

revoke all on function public.assign_nodal_desk_identity() from public, anon, authenticated;
revoke all on function public.nodal_refresh_user_identifier(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.sync_nodal_user_identifier_from_terms() from public, anon, authenticated;
revoke all on function public.nodal_desk_is_descendant(uuid,uuid) from public, anon;
revoke all on function public.nodal_user_managed_desk_id(uuid,date) from public, anon;
revoke all on function public.desk_admin_save_user_v2(uuid,text,text,boolean,integer,boolean,integer,uuid[],uuid,uuid) from public, anon;
grant execute on function public.nodal_desk_is_descendant(uuid,uuid) to authenticated;
grant execute on function public.nodal_user_managed_desk_id(uuid,date) to authenticated;
grant execute on function public.desk_admin_save_user_v2(uuid,text,text,boolean,integer,boolean,integer,uuid[],uuid,uuid) to authenticated;

comment on table public.nodal_user_identifiers is
  'Historial inmutable de IDs visibles. Un cambio de mesa cierra el ID vigente y asigna el siguiente correlativo del destino.';
comment on function public.desk_admin_save_user_v2(uuid,text,text,boolean,integer,boolean,integer,uuid[],uuid,uuid) is
  'Guarda la ficha administrativa, traslada mesas completas y reasigna dependencias en una unica transaccion auditada.';
