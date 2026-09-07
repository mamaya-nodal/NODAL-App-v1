-- Master administration. Desk ownership never changes trading workspace ownership.
create table public.nodal_desks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  parent_id uuid references public.nodal_desks(id),
  created_at timestamptz not null default now()
);
create unique index nodal_desks_single_root on public.nodal_desks ((parent_id is null)) where parent_id is null;
insert into public.nodal_desks(id,name) values ('00000000-0000-4000-8000-000000000001','Mesa principal NODAL');

create table public.nodal_desk_terms (
  desk_id uuid not null references public.nodal_desks(id),
  effective_month date not null check (extract(day from effective_month)=1),
  manager_id uuid references public.nodal_users(id),
  nodal_bps integer not null check (nodal_bps between 0 and 10000),
  active boolean not null default true,
  primary key (desk_id,effective_month)
);
insert into public.nodal_desk_terms values ('00000000-0000-4000-8000-000000000001','2000-01-01',null,10000,true);

create table public.nodal_user_terms (
  user_id uuid not null references public.nodal_users(id),
  effective_month date not null check (extract(day from effective_month)=1),
  desk_id uuid not null references public.nodal_desks(id),
  level integer not null default 1 check (level between 1 and 3),
  state text not null default 'active' check (state in ('active','paused','inactive')),
  commission_bps integer not null check (commission_bps between 0 and 10000),
  bonus_enabled boolean not null default true,
  primary key (user_id,effective_month)
);
create table public.nodal_management_history (
  id bigint generated always as identity primary key,
  user_id uuid references public.nodal_users(id),
  desk_id uuid references public.nodal_desks(id),
  actor_id uuid not null references public.nodal_users(id),
  occurred_at timestamptz not null default now(),
  effective_month date not null,
  action text not null,
  before_data jsonb,
  after_data jsonb not null
);
alter table public.nodal_desks enable row level security;
alter table public.nodal_desk_terms enable row level security;
alter table public.nodal_user_terms enable row level security;
alter table public.nodal_management_history enable row level security;
revoke all on public.nodal_desks,public.nodal_desk_terms,public.nodal_user_terms,public.nodal_management_history from anon,authenticated;
grant select on public.nodal_desks,public.nodal_desk_terms,public.nodal_user_terms,public.nodal_management_history to authenticated;
create policy desks_master_read on public.nodal_desks for select to authenticated using (public.is_current_user_admin());
create policy desk_terms_master_read on public.nodal_desk_terms for select to authenticated using (public.is_current_user_admin());
create policy user_terms_read on public.nodal_user_terms for select to authenticated using (public.is_current_user_admin() or user_id=auth.uid());
create policy management_history_master_read on public.nodal_management_history for select to authenticated using (public.is_current_user_admin());

create function public.admin_save_user_terms(p_user uuid,p_month date,p_desk uuid,p_level integer,p_state text,p_commission integer,p_bonus boolean)
returns void language plpgsql security definer set search_path='' as $$
declare old_row jsonb; new_row jsonb; current_month date := date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_month is null or p_month <> current_month or extract(day from p_month)<>1 then raise exception 'INVALID_EFFECTIVE_MONTH'; end if;
  perform pg_advisory_xact_lock(9080701);
  if not exists(select 1 from public.nodal_users where id=p_user and access_state='active') then raise exception 'USER_NOT_ACTIVE'; end if;
  if not coalesce((select active from public.nodal_desk_terms where desk_id=p_desk and effective_month<=p_month order by effective_month desc limit 1),false) then raise exception 'DESK_NOT_ACTIVE'; end if;
  select to_jsonb(t) into old_row from public.nodal_user_terms t where user_id=p_user and effective_month<=p_month order by effective_month desc limit 1;
  insert into public.nodal_user_terms values(p_user,p_month,p_desk,p_level,p_state,p_commission,p_bonus)
  on conflict(user_id,effective_month) do update set desk_id=excluded.desk_id,level=excluded.level,state=excluded.state,commission_bps=excluded.commission_bps,bonus_enabled=excluded.bonus_enabled;
  select to_jsonb(t) into new_row from public.nodal_user_terms t where user_id=p_user and effective_month=p_month;
  if old_row is distinct from new_row then
    insert into public.nodal_management_history(user_id,desk_id,actor_id,effective_month,action,before_data,after_data)
    values(p_user,p_desk,auth.uid(),p_month,'user_terms',old_row,new_row);
  end if;
end $$;

create function public.admin_save_desk(p_id uuid,p_name text,p_parent uuid,p_manager uuid,p_month date,p_nodal integer,p_active boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid:=p_id; old_row jsonb; new_row jsonb; current_month date:=date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires')::date; manager_level integer; origin uuid; bonus_owner uuid; previous_count integer; next_count integer;
begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_month is null or p_month<>current_month or extract(day from p_month)<>1 then raise exception 'INVALID_EFFECTIVE_MONTH'; end if;
  perform pg_advisory_xact_lock(9080701);
  if p_manager is null or not exists(select 1 from public.nodal_users where id=p_manager and access_state='active') then raise exception 'USER_NOT_ACTIVE'; end if;
  origin:=case when target is null then p_parent else (select parent_id from public.nodal_desks where id=target) end;
  if p_active and not coalesce((select active from public.nodal_desk_terms where desk_id=origin and effective_month<=p_month order by effective_month desc limit 1),false) then raise exception 'DESK_NOT_ACTIVE'; end if;
  select manager_id into bonus_owner from public.nodal_desk_terms where desk_id=origin and effective_month<=p_month order by effective_month desc limit 1;
  select count(*) into previous_count from public.nodal_desks d join lateral (select active from public.nodal_desk_terms where desk_id=d.id and effective_month<=p_month order by effective_month desc limit 1) t on t.active where d.parent_id=origin;
  select level into manager_level from public.nodal_user_terms where user_id=p_manager and effective_month<=p_month order by effective_month desc limit 1;
  if coalesce(manager_level,1)<2 then raise exception 'LEVEL_TWO_REQUIRED'; end if;
  if exists(select 1 from (select distinct on(desk_id) * from public.nodal_desk_terms where effective_month<=p_month order by desk_id,effective_month desc) t where manager_id=p_manager and active and desk_id is distinct from target) then raise exception 'ALREADY_MANAGES_DESK'; end if;
  if target is null then
    if not coalesce((select active from public.nodal_desk_terms where desk_id=p_parent and effective_month<=p_month order by effective_month desc limit 1),false) then raise exception 'DESK_NOT_ACTIVE'; end if;
    insert into public.nodal_desks(name,parent_id) values(p_name,p_parent) returning id into target;
  else
    if not exists(select 1 from public.nodal_desks where id=target and parent_id is not null) then raise exception 'INVALID_DESK'; end if;
    select to_jsonb(t) into old_row from public.nodal_desk_terms t where desk_id=target and effective_month<=p_month order by effective_month desc limit 1;
    -- The origin and name remain stable. Replacing the manager does not move traders.
  end if;
  if not p_active and (exists(select 1 from (select distinct on(user_id) * from public.nodal_user_terms where effective_month<=p_month order by user_id,effective_month desc) t where desk_id=target) or exists(select 1 from public.nodal_desks d join lateral (select active from public.nodal_desk_terms where desk_id=d.id and effective_month<=p_month order by effective_month desc limit 1) t on t.active where d.parent_id=target)) then raise exception 'DESK_HAS_MEMBERS'; end if;
  insert into public.nodal_desk_terms values(target,p_month,p_manager,p_nodal,p_active)
  on conflict(desk_id,effective_month) do update set manager_id=excluded.manager_id,nodal_bps=excluded.nodal_bps,active=excluded.active;
  select to_jsonb(t) into new_row from public.nodal_desk_terms t where desk_id=target and effective_month=p_month;
  insert into public.nodal_management_history(user_id,desk_id,actor_id,effective_month,action,before_data,after_data)
  values(p_manager,target,auth.uid(),p_month,'desk_terms',old_row,new_row);
  if old_row->>'manager_id' is not null and old_row->>'manager_id'<>p_manager::text then
    insert into public.nodal_management_history(user_id,desk_id,actor_id,effective_month,action,before_data,after_data)
    values((old_row->>'manager_id')::uuid,target,auth.uid(),p_month,'manager_replaced',old_row,new_row);
  end if;
  select count(*) into next_count from public.nodal_desks d join lateral (select active from public.nodal_desk_terms where desk_id=d.id and effective_month<=p_month order by effective_month desc limit 1) t on t.active where d.parent_id=origin;
  if bonus_owner is not null and previous_count<>next_count then
    insert into public.nodal_management_history(user_id,desk_id,actor_id,effective_month,action,before_data,after_data)
    values(bonus_owner,origin,auth.uid(),p_month,'bonus_threshold',
      jsonb_build_object('direct_desks',previous_count,'bonus_bps',case when previous_count>=10 then 5000 when previous_count>=5 then 4000 when previous_count>=3 then 3000 when previous_count>=1 then 1500 else 0 end),
      jsonb_build_object('direct_desks',next_count,'bonus_bps',case when next_count>=10 then 5000 when next_count>=5 then 4000 when next_count>=3 then 3000 when next_count>=1 then 1500 else 0 end));
  end if;
  return target;
end $$;
revoke all on function public.admin_save_user_terms(uuid,date,uuid,integer,text,integer,boolean),public.admin_save_desk(uuid,text,uuid,uuid,date,integer,boolean) from public,anon;
grant execute on function public.admin_save_user_terms(uuid,date,uuid,integer,text,integer,boolean),public.admin_save_desk(uuid,text,uuid,uuid,date,integer,boolean) to authenticated;
