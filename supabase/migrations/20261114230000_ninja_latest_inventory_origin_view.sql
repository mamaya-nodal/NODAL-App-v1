-- Service readers must not infer the owner's subaccount count from whichever
-- routed fragment happened to reach the personal destination last.
create or replace view public.ninja_latest_inventory_by_origin
with (security_invoker=true) as
select distinct on(s.connector_id,coalesce(s.physical_connector_id,s.connector_id))
  s.connector_id,coalesce(s.physical_connector_id,s.connector_id) as physical_connector_id,
  s.observed_at,s.accounts
from public.ninja_inventory_snapshots s
order by s.connector_id,coalesce(s.physical_connector_id,s.connector_id),s.observed_at desc;
revoke all on public.ninja_latest_inventory_by_origin from public,anon,authenticated;
grant select on public.ninja_latest_inventory_by_origin to service_role;
