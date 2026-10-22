-- Final, explicit profit distribution. Only Admin Master may mutate it.
create table public.nodal_user_distribution_terms (
  user_id uuid not null references public.nodal_users(id),
  effective_month date not null check (extract(day from effective_month) = 1),
  user_bps integer not null check (user_bps between 0 and 10000),
  nodal_bps integer not null check (nodal_bps between 0 and 10000),
  admin_pool_bps integer not null check (admin_pool_bps between 0 and 10000),
  primary key (user_id, effective_month),
  constraint nodal_user_distribution_total check (user_bps + nodal_bps + admin_pool_bps = 10000)
);

create table public.nodal_user_distribution_admin_shares (
  user_id uuid not null,
  effective_month date not null,
  admin_user_id uuid not null references public.nodal_users(id),
  share_bps integer not null check (share_bps between 1 and 10000),
  primary key (user_id, effective_month, admin_user_id),
  foreign key (user_id, effective_month)
    references public.nodal_user_distribution_terms(user_id, effective_month)
    on delete cascade,
  constraint nodal_distribution_admin_not_self check (admin_user_id <> user_id)
);

alter table public.nodal_user_distribution_terms enable row level security;
alter table public.nodal_user_distribution_admin_shares enable row level security;
revoke all on public.nodal_user_distribution_terms, public.nodal_user_distribution_admin_shares from anon, authenticated;
grant select on public.nodal_user_distribution_terms, public.nodal_user_distribution_admin_shares to authenticated;

create policy distribution_terms_read on public.nodal_user_distribution_terms
for select to authenticated using (public.is_current_user_admin() or user_id = auth.uid());
create policy distribution_shares_read on public.nodal_user_distribution_admin_shares
for select to authenticated using (
  public.is_current_user_admin() or user_id = auth.uid() or admin_user_id = auth.uid()
);

-- Existing desk-management RPCs also carry the legacy percentages. They remain
-- useful for roles and hierarchy, but a branch administrator must never be able
-- to change economics through that older entry point. Preserve the current
-- values server-side regardless of what its client sends.
do $migration$
declare
  signature regprocedure := 'public.desk_admin_save_user_v2(uuid,text,text,boolean,integer,boolean,integer,uuid[],uuid,uuid)'::regprocedure;
  definition text;
  old_fragment text := '  if old_terms.desk_id is distinct from target_desk and managed_desk is not null then';
  new_fragment text := '  if not public.is_current_user_admin() then
    target_commission_bps := old_terms.commission_bps;
    target_admin_bps := case
      when target_is_admin then coalesce(prior_desk_terms.nodal_bps, 10000)
      else null
    end;
  end if;

  if old_terms.desk_id is distinct from target_desk and managed_desk is not null then';
begin
  definition := pg_get_functiondef(signature);
  if position(new_fragment in definition) > 0 then return; end if;
  if position(old_fragment in definition) = 0 then
    raise exception 'Unexpected desk administration function: review migration before applying';
  end if;
  execute replace(definition, old_fragment, new_fragment);
end;
$migration$;

-- Preserve the current economics by materializing the existing cascade as a
-- final distribution for the open month. Historical periods keep their frozen
-- legacy terms and are never rewritten.
do $$
declare
  month date := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date;
  member record;
  desk record;
  current_desk uuid;
  remaining integer;
  manager_share integer;
  admin_total integer;
  visited uuid[];
begin
  for member in
    select distinct on (terms.user_id)
      terms.user_id, terms.desk_id, terms.commission_bps
    from public.nodal_user_terms terms
    join public.nodal_users users on users.id = terms.user_id and users.access_state = 'active'
    where terms.effective_month <= month
    order by terms.user_id, terms.effective_month desc
  loop
    remaining := member.commission_bps;
    admin_total := 0;
    current_desk := member.desk_id;
    visited := array[]::uuid[];

    insert into public.nodal_user_distribution_terms(
      user_id, effective_month, user_bps, nodal_bps, admin_pool_bps
    ) values (member.user_id, month, 10000 - member.commission_bps, member.commission_bps, 0)
    on conflict (user_id, effective_month) do nothing;

    while current_desk is not null and remaining > 0 and not current_desk = any(visited) loop
      visited := array_append(visited, current_desk);
      select d.parent_id, active.manager_id, active.nodal_bps
      into desk
      from public.nodal_desks d
      join lateral (
        select terms.manager_id, terms.nodal_bps
        from public.nodal_desk_terms terms
        where terms.desk_id = d.id and terms.effective_month <= month and terms.active
        order by terms.effective_month desc limit 1
      ) active on true
      where d.id = current_desk;
      exit when not found;

      manager_share := case when desk.manager_id is null then 0
        else round(remaining * (10000 - desk.nodal_bps)::numeric / 10000)::integer end;
      if manager_share > 0 then
        insert into public.nodal_user_distribution_admin_shares(
          user_id, effective_month, admin_user_id, share_bps
        ) values (member.user_id, month, desk.manager_id, manager_share)
        on conflict (user_id, effective_month, admin_user_id) do update
        set share_bps = nodal_user_distribution_admin_shares.share_bps + excluded.share_bps;
        admin_total := admin_total + manager_share;
        remaining := remaining - manager_share;
      end if;
      current_desk := desk.parent_id;
    end loop;

    update public.nodal_user_distribution_terms
    set nodal_bps = remaining, admin_pool_bps = admin_total
    where user_id = member.user_id and effective_month = month;
  end loop;
end $$;

create or replace function public.admin_save_user_distribution(
  target_user_id uuid,
  target_effective_month date,
  target_user_bps integer,
  target_nodal_bps integer,
  target_admin_pool_bps integer,
  target_admin_shares jsonb,
  management_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  month date := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date;
  current_terms public.nodal_user_terms%rowtype;
  eligible_admins uuid[];
  share_record record;
  shares_total integer := 0;
  old_data jsonb;
  new_data jsonb;
begin
  if actor_id is null or not public.is_current_user_admin() then raise exception 'ADMIN_MASTER_REQUIRED'; end if;
  if target_effective_month is distinct from month then raise exception 'CURRENT_PERIOD_ONLY'; end if;
  if target_user_bps is null or target_nodal_bps is null or target_admin_pool_bps is null
    or target_user_bps not between 0 and 10000
    or target_nodal_bps not between 0 and 10000
    or target_admin_pool_bps not between 0 and 10000
    or target_user_bps + target_nodal_bps + target_admin_pool_bps <> 10000 then
    raise exception 'DISTRIBUTION_MUST_TOTAL_100';
  end if;
  if jsonb_typeof(target_admin_shares) is distinct from 'array' then raise exception 'INVALID_ADMIN_SHARES'; end if;
  if length(btrim(coalesce(management_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;

  perform pg_advisory_xact_lock(9080711);
  select * into current_terms from public.nodal_user_terms
  where user_id = target_user_id and effective_month <= month
  order by effective_month desc limit 1 for update;
  if not found then raise exception 'USER_TERMS_NOT_FOUND'; end if;

  with recursive desk_chain as (
    select d.id, d.parent_id from public.nodal_desks d where d.id = current_terms.desk_id
    union all
    select parent.id, parent.parent_id
    from public.nodal_desks parent join desk_chain child on child.parent_id = parent.id
  ), managers as (
    select latest.manager_id
    from desk_chain chain
    join lateral (
      select terms.manager_id
      from public.nodal_desk_terms terms
      where terms.desk_id = chain.id and terms.effective_month <= month and terms.active
      order by terms.effective_month desc limit 1
    ) latest on latest.manager_id is not null
  ) select coalesce(array_agg(distinct manager_id), array[]::uuid[]) into eligible_admins from managers;

  for share_record in
    select (entry->>'adminUserId')::uuid as admin_user_id,
      (entry->>'shareBps')::integer as share_bps
    from jsonb_array_elements(target_admin_shares) entry
  loop
    if share_record.admin_user_id = target_user_id
      or not share_record.admin_user_id = any(eligible_admins)
      or share_record.share_bps not between 1 and 10000 then
      raise exception 'INVALID_ADMIN_SHARE';
    end if;
    shares_total := shares_total + share_record.share_bps;
  end loop;
  if (select count(*) from jsonb_array_elements(target_admin_shares)) <>
    (select count(distinct entry->>'adminUserId') from jsonb_array_elements(target_admin_shares) entry) then
    raise exception 'DUPLICATE_ADMIN_SHARE';
  end if;
  if shares_total <> target_admin_pool_bps then raise exception 'ADMIN_POOL_MISMATCH'; end if;

  select jsonb_build_object(
    'terms', to_jsonb(terms),
    'shares', coalesce((select jsonb_agg(to_jsonb(shares)) from public.nodal_user_distribution_admin_shares shares
      where shares.user_id = target_user_id and shares.effective_month = terms.effective_month), '[]'::jsonb)
  ) into old_data
  from public.nodal_user_distribution_terms terms
  where terms.user_id = target_user_id and terms.effective_month <= month
  order by terms.effective_month desc limit 1;

  insert into public.nodal_user_distribution_terms(
    user_id, effective_month, user_bps, nodal_bps, admin_pool_bps
  ) values (
    target_user_id, month, target_user_bps, target_nodal_bps, target_admin_pool_bps
  ) on conflict (user_id, effective_month) do update set
    user_bps = excluded.user_bps,
    nodal_bps = excluded.nodal_bps,
    admin_pool_bps = excluded.admin_pool_bps;

  delete from public.nodal_user_distribution_admin_shares
  where user_id = target_user_id and effective_month = month;
  insert into public.nodal_user_distribution_admin_shares(user_id, effective_month, admin_user_id, share_bps)
  select target_user_id, month, (entry->>'adminUserId')::uuid, (entry->>'shareBps')::integer
  from jsonb_array_elements(target_admin_shares) entry;

  insert into public.nodal_user_terms(user_id, effective_month, desk_id, level, state, commission_bps, bonus_enabled)
  values(target_user_id, month, current_terms.desk_id, current_terms.level, current_terms.state,
    target_nodal_bps + target_admin_pool_bps, false)
  on conflict(user_id, effective_month) do update set
    commission_bps = excluded.commission_bps,
    bonus_enabled = false;

  select jsonb_build_object(
    'terms', to_jsonb(terms),
    'shares', coalesce((select jsonb_agg(to_jsonb(shares)) from public.nodal_user_distribution_admin_shares shares
      where shares.user_id = target_user_id and shares.effective_month = month), '[]'::jsonb)
  ) into new_data
  from public.nodal_user_distribution_terms terms
  where terms.user_id = target_user_id and terms.effective_month = month;

  if old_data is distinct from new_data then
    insert into public.nodal_management_history(
      user_id, desk_id, actor_id, effective_month, action, before_data, after_data
    ) values (
      target_user_id, current_terms.desk_id, actor_id, month, 'user_distribution',
      old_data, new_data || jsonb_build_object('reason', btrim(management_reason))
    );
  end if;
end;
$$;

revoke all on function public.admin_save_user_distribution(uuid,date,integer,integer,integer,jsonb,text) from public, anon;
grant execute on function public.admin_save_user_distribution(uuid,date,integer,integer,integer,jsonb,text) to authenticated;

comment on table public.nodal_user_distribution_terms is
  'Final user/NODAL/admin-pool split by period. Only Admin Master may mutate through the audited RPC.';
comment on function public.admin_save_user_distribution(uuid,date,integer,integer,integer,jsonb,text) is
  'Saves a 100% final distribution and an exact manual breakdown among administrators in the current ancestor chain.';
