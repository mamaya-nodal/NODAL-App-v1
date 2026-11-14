-- Routed inventories are fragments from physical installations, not replacements
-- for every installation contributing to the same accounting destination.
create index if not exists ninja_inventory_dest_origin_observed_idx
  on public.ninja_inventory_snapshots(connector_id,(coalesce(physical_connector_id,connector_id)),observed_at desc);
create or replace function public.get_current_user_ninja_inventory()
returns table(connector_id uuid, observed_at timestamptz, accounts jsonb)
language sql stable security definer set search_path=''
as $$
  with current_connectors as (
    select c.id from public.ninja_connectors c
    where c.owner_user_id=(select auth.uid()) and c.status='active'
      and public.is_current_user_active()
  ), latest_by_origin as (
    select distinct on(s.connector_id,coalesce(s.physical_connector_id,s.connector_id))
      s.connector_id,s.observed_at,s.accounts
    from public.ninja_inventory_snapshots s
    join current_connectors c on c.id=s.connector_id
    order by s.connector_id,coalesce(s.physical_connector_id,s.connector_id),s.observed_at desc
  ), freshest_accounts as (
    select distinct on(s.connector_id,a->>'connectionName',a->>'accountName')
      s.connector_id,s.observed_at,a as account
    from latest_by_origin s cross join lateral jsonb_array_elements(s.accounts) a
    order by s.connector_id,a->>'connectionName',a->>'accountName',s.observed_at desc
  )
  select c.id,max(s.observed_at),coalesce((
    select jsonb_agg(a.account || jsonb_build_object('firstSeenAt',(
      select min(h.observed_at)
      from public.ninja_inventory_snapshots h cross join lateral jsonb_array_elements(h.accounts) prior
      where h.connector_id=c.id
        and prior->>'connectionName'=a.account->>'connectionName'
        and prior->>'accountName'=a.account->>'accountName'
    )) order by a.account->>'connectionName',a.account->>'accountName')
    from freshest_accounts a where a.connector_id=c.id
      and not exists(select 1 from public.ninja_connector_connection_reviews r
        where r.connector_id=c.id and r.connection_name=a.account->>'connectionName' and r.status='isolated')
      and not exists(select 1 from public.ninja_broker_account_exclusions e
        where e.owner_user_id=(select auth.uid())
          and upper(btrim(e.account_name))=upper(btrim(a.account->>'accountName')))
  ),'[]'::jsonb)
  from current_connectors c join latest_by_origin s on s.connector_id=c.id
  group by c.id;
$$;
