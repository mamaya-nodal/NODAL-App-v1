create table public.ninja_connection_reviews (
  id uuid primary key default gen_random_uuid(),
  machine_id text not null references public.ninja_machine_assignments(machine_id) on delete restrict,
  connection_name text not null,
  status text not null check (status in ('approved', 'isolated')),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  unique(machine_id, connection_name),
  constraint ninja_connection_review_name_present check (length(btrim(connection_name)) > 0)
);

alter table public.ninja_connection_reviews enable row level security;
revoke all on table public.ninja_connection_reviews from public, anon, authenticated;

create function public.admin_list_ninja_connections()
returns table(machine_id text, connection_name text, account_count bigint, review_status text)
language sql stable security definer set search_path = ''
as $$
  with latest as (
    select distinct on (snapshots.machine_id) snapshots.machine_id, snapshots.accounts
    from public.ninja_inventory_snapshots snapshots
    order by snapshots.machine_id, snapshots.observed_at desc
  ), observed as (
    select latest.machine_id, account->>'connectionName' connection_name, count(*) account_count
    from latest, jsonb_array_elements(latest.accounts) account
    where nullif(btrim(account->>'connectionName'), '') is not null
    group by latest.machine_id, account->>'connectionName'
  )
  select observed.machine_id, observed.connection_name, observed.account_count, reviews.status
  from observed
  left join public.ninja_connection_reviews reviews
    on reviews.machine_id = observed.machine_id and reviews.connection_name = observed.connection_name
  where public.is_current_user_admin()
  order by observed.machine_id, observed.connection_name;
$$;

create function public.admin_review_ninja_connection(
  target_machine_id text, target_connection_name text, target_status text, management_reason text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  review_id uuid;
  previous_data jsonb;
  current_data jsonb;
begin
  if actor_id is null or not public.is_current_user_admin() then raise exception 'Not authorized'; end if;
  if target_status not in ('approved', 'isolated') or nullif(btrim(management_reason), '') is null then
    raise exception 'Invalid review';
  end if;
  if not exists (select 1 from public.ninja_machine_assignments a where a.machine_id = btrim(target_machine_id)) then
    raise exception 'Machine must be assigned first';
  end if;
  if not exists (
    select 1 from public.ninja_inventory_snapshots snapshots, jsonb_array_elements(snapshots.accounts) account
    where snapshots.machine_id = btrim(target_machine_id)
      and account->>'connectionName' = btrim(target_connection_name)
  ) then raise exception 'Connection was not observed'; end if;

  select to_jsonb(reviews) into previous_data from public.ninja_connection_reviews reviews
  where reviews.machine_id = btrim(target_machine_id) and reviews.connection_name = btrim(target_connection_name);

  insert into public.ninja_connection_reviews(machine_id, connection_name, status, reviewed_by)
  values (btrim(target_machine_id), btrim(target_connection_name), target_status, actor_id)
  on conflict(machine_id, connection_name) do update set
    status = excluded.status, reviewed_by = actor_id, reviewed_at = now()
  returning id into review_id;

  select to_jsonb(reviews) into current_data from public.ninja_connection_reviews reviews where reviews.id = review_id;
  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason)
  values (actor_id, 'ninja_connection_reviews', review_id, 'ninja_connection_reviewed', previous_data, current_data, btrim(management_reason));
  return review_id;
end;
$$;

create or replace function public.get_current_user_ninja_inventory()
returns table (machine_id text, observed_at timestamptz, accounts jsonb)
language sql stable security definer set search_path = ''
as $$
  with assigned as (
    select assignments.machine_id
    from public.ninja_machine_assignments assignments
    where assignments.owner_user_id = (select auth.uid()) and public.is_current_user_active()
  ), latest as (
    select distinct on (snapshots.machine_id) snapshots.machine_id, snapshots.observed_at, snapshots.accounts
    from public.ninja_inventory_snapshots snapshots join assigned on assigned.machine_id = snapshots.machine_id
    order by snapshots.machine_id, snapshots.observed_at desc
  )
  select latest.machine_id, latest.observed_at,
    coalesce((
      select jsonb_agg(account || jsonb_build_object('firstSeenAt', (
        select min(history.observed_at)
        from public.ninja_inventory_snapshots history, jsonb_array_elements(history.accounts) historical_account
        where history.machine_id = latest.machine_id
          and historical_account->>'connectionName' = account->>'connectionName'
          and historical_account->>'accountName' = account->>'accountName'
      )))
      from jsonb_array_elements(latest.accounts) account
      join public.ninja_connection_reviews reviews
        on reviews.machine_id = latest.machine_id
       and reviews.connection_name = account->>'connectionName'
       and reviews.status = 'approved'
    ), '[]'::jsonb) accounts
  from latest;
$$;

revoke all on function public.admin_list_ninja_connections() from public, anon;
revoke all on function public.admin_review_ninja_connection(text, text, text, text) from public, anon;
grant execute on function public.admin_list_ninja_connections() to authenticated;
grant execute on function public.admin_review_ninja_connection(text, text, text, text) to authenticated;

create function public.enforce_approved_ninja_account_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.ninja_machine_assignments assignments
    join public.ninja_connection_reviews reviews
      on reviews.machine_id = assignments.machine_id
     and reviews.connection_name = new.connection_name
     and reviews.status = 'approved'
    where assignments.machine_id = new.machine_id
      and assignments.owner_user_id = new.linked_by
  ) then
    raise exception 'Ninja connection is not approved for this user';
  end if;
  return new;
end;
$$;

create trigger ninja_account_links_require_approved_connection
before insert on public.ninja_account_links
for each row execute function public.enforce_approved_ninja_account_link();

revoke all on function public.enforce_approved_ninja_account_link() from public, anon, authenticated;
