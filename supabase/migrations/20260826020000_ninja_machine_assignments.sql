create table public.ninja_machine_assignments (
  id uuid primary key default gen_random_uuid(),
  machine_id text not null unique,
  owner_user_id uuid not null references public.nodal_users(id) on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ninja_machine_assignment_machine_present check (length(btrim(machine_id)) > 0)
);

alter table public.ninja_machine_assignments enable row level security;
revoke all on table public.ninja_machine_assignments from public, anon, authenticated;

create function public.admin_list_ninja_machines()
returns table (
  machine_id text,
  observed_at timestamptz,
  account_count integer,
  connections text[],
  owner_user_id uuid,
  owner_email text,
  owner_display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with latest as (
    select distinct on (snapshots.machine_id)
      snapshots.machine_id,
      snapshots.observed_at,
      snapshots.account_count,
      snapshots.accounts
    from public.ninja_inventory_snapshots snapshots
    order by snapshots.machine_id, snapshots.observed_at desc
  )
  select
    latest.machine_id,
    latest.observed_at,
    latest.account_count,
    coalesce((
      select array_agg(distinct account->>'connectionName' order by account->>'connectionName')
      from jsonb_array_elements(latest.accounts) account
      where nullif(btrim(account->>'connectionName'), '') is not null
    ), array[]::text[]) as connections,
    assignments.owner_user_id,
    users.email,
    users.display_name
  from latest
  left join public.ninja_machine_assignments assignments on assignments.machine_id = latest.machine_id
  left join public.nodal_users users on users.id = assignments.owner_user_id
  where public.is_current_user_admin()
  order by latest.observed_at desc;
$$;

create function public.admin_assign_ninja_machine(
  target_machine_id text,
  target_owner_user_id uuid,
  management_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  assignment_id uuid;
  previous_data jsonb;
  current_data jsonb;
begin
  if actor_id is null or not public.is_current_user_admin() then
    raise exception 'Not authorized';
  end if;
  if nullif(btrim(target_machine_id), '') is null or nullif(btrim(management_reason), '') is null then
    raise exception 'Machine and reason are required';
  end if;
  if not exists (
    select 1 from public.nodal_users users
    where users.id = target_owner_user_id and users.access_state = 'active'
  ) then
    raise exception 'Target user is not active';
  end if;
  if not exists (
    select 1 from public.ninja_inventory_snapshots snapshots
    where snapshots.machine_id = btrim(target_machine_id)
  ) then
    raise exception 'Machine was not observed';
  end if;

  select to_jsonb(assignments) into previous_data
  from public.ninja_machine_assignments assignments
  where assignments.machine_id = btrim(target_machine_id);

  insert into public.ninja_machine_assignments(machine_id, owner_user_id, assigned_by)
  values (btrim(target_machine_id), target_owner_user_id, actor_id)
  on conflict (machine_id) do update set
    owner_user_id = excluded.owner_user_id,
    assigned_by = actor_id,
    assigned_at = now(),
    updated_at = now()
  returning id into assignment_id;

  select to_jsonb(assignments) into current_data
  from public.ninja_machine_assignments assignments
  where assignments.id = assignment_id;

  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason)
  values (actor_id, 'ninja_machine_assignments', assignment_id, 'ninja_machine_assigned', previous_data, current_data, btrim(management_reason));

  return assignment_id;
end;
$$;

revoke all on function public.admin_list_ninja_machines() from public, anon;
revoke all on function public.admin_assign_ninja_machine(text, uuid, text) from public, anon;
grant execute on function public.admin_list_ninja_machines() to authenticated;
grant execute on function public.admin_assign_ninja_machine(text, uuid, text) to authenticated;
