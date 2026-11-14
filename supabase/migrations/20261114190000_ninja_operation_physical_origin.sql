-- Preserve observation origin independently from the accounting destination.
-- No historical economic rows are changed and no replay is scheduled here.
begin;
alter table public.ninja_trade_telemetry_events add column physical_connector_id uuid
  references public.ninja_connectors(id) on delete restrict;
alter table public.ninja_operation_probe_sessions add column physical_connector_id uuid
  references public.ninja_connectors(id) on delete restrict;
create index ninja_receipts_destination_event_origin on public.ninja_event_receipts
  (destination_connector_id,event_id) where status='persisted';

create function public.stamp_ninja_telemetry_origin() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.physical_connector_id is null then
    new.physical_connector_id := nullif(current_setting('nodal.ninja_physical_origin',true),'')::uuid;
  end if;
  return new;
end $$;
create trigger ninja_telemetry_origin before insert on public.ninja_trade_telemetry_events
  for each row execute function public.stamp_ninja_telemetry_origin();
revoke all on function public.stamp_ninja_telemetry_origin() from public,anon,authenticated;

do $migration$
declare definition text; anchor text := 'perform pg_advisory_xact_lock(hashtextextended(target_physical::text,0));';
begin
  select pg_get_functiondef('public.receive_ninja_telemetry_v2(uuid,jsonb)'::regprocedure) into definition;
  if strpos(definition,anchor)=0 then raise exception 'Unexpected v2 origin insertion point'; end if;
  definition := replace(definition,anchor,anchor || E'\nperform set_config(''nodal.ninja_physical_origin'',target_physical::text,true);');
  execute definition;
end $migration$;

-- Resolve legacy v2 provenance on demand, without guessing from destination.
-- A receipt may only establish origin when exactly one matching source exists.
create function public.get_ninja_telemetry_origins(target_event_ids bigint[])
returns table(event_id bigint,physical_connector_id uuid)
language sql stable security definer set search_path='' as $$
  select e.id,coalesce(e.physical_connector_id,
    case when count(distinct r.physical_connector_id)=1
      then (array_agg(distinct r.physical_connector_id))[1] else null end)
  from public.ninja_trade_telemetry_events e
  left join public.ninja_event_receipts r on r.destination_connector_id=e.connector_id
    and r.event_id=e.event_id and r.status='persisted' and r.payload=e.payload
  where e.id=any(target_event_ids) and cardinality(target_event_ids)<=1000
  group by e.id,e.physical_connector_id;
$$;
revoke all on function public.get_ninja_telemetry_origins(bigint[]) from public,anon,authenticated;
grant execute on function public.get_ninja_telemetry_origins(bigint[]) to service_role;
commit;
