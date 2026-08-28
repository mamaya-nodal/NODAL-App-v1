create function public.get_current_user_ninja_inventory()
returns table (machine_id text, observed_at timestamptz, accounts jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with assigned as (
    select assignments.machine_id
    from public.ninja_machine_assignments assignments
    where assignments.owner_user_id = (select auth.uid())
      and public.is_current_user_active()
  ), latest as (
    select distinct on (snapshots.machine_id)
      snapshots.machine_id, snapshots.observed_at, snapshots.accounts
    from public.ninja_inventory_snapshots snapshots
    join assigned on assigned.machine_id = snapshots.machine_id
    order by snapshots.machine_id, snapshots.observed_at desc
  )
  select latest.machine_id, latest.observed_at,
    coalesce((
      select jsonb_agg(account || jsonb_build_object('firstSeenAt', (
        select min(history.observed_at)
        from public.ninja_inventory_snapshots history,
             jsonb_array_elements(history.accounts) historical_account
        where history.machine_id = latest.machine_id
          and historical_account->>'connectionName' = account->>'connectionName'
          and historical_account->>'accountName' = account->>'accountName'
      )))
      from jsonb_array_elements(latest.accounts) account
    ), '[]'::jsonb) as accounts
  from latest;
$$;

revoke all on function public.get_current_user_ninja_inventory() from public, anon;
grant execute on function public.get_current_user_ninja_inventory() to authenticated;
