-- Additive, service-only transport ledger. No economic records are migrated.
create table public.ninja_event_receipts (
  physical_connector_id uuid not null references public.ninja_connectors(id) on delete restrict,
  event_id text not null check(length(event_id) between 1 and 160),
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  destination_connector_id uuid references public.ninja_connectors(id) on delete restrict,
  status text not null check(status in ('pending','persisted','excluded','conflict')),
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  primary key(physical_connector_id,event_id)
);
create index ninja_event_receipts_pending on public.ninja_event_receipts(physical_connector_id,next_attempt_at)
  where status='pending';
alter table public.ninja_event_receipts enable row level security;
revoke all on public.ninja_event_receipts from public,anon,authenticated;
grant select,insert,update on public.ninja_event_receipts to service_role;

create table public.ninja_telemetry_rebuild_jobs (
  connector_id uuid primary key references public.ninja_connectors(id) on delete restrict,
  revision bigint not null default 1,
  completed_revision bigint not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  attempts bigint not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.ninja_telemetry_rebuild_jobs enable row level security;
revoke all on public.ninja_telemetry_rebuild_jobs from public,anon,authenticated;
grant select on public.ninja_telemetry_rebuild_jobs to service_role;

create function public.receive_ninja_telemetry_v2(target_physical uuid, target_events jsonb)
returns table(event_id text,payload_hash text,status text,reason text)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare e jsonb; r public.ninja_event_receipts%rowtype; dest uuid; existing_payload jsonb;
begin
  if not exists(select 1 from public.ninja_connectors c join public.nodal_users u on u.id=c.owner_user_id
    where c.id=target_physical and c.status='active' and u.access_state='active') then
    raise exception 'Connector unavailable';
  end if;
  if jsonb_typeof(target_events) is distinct from 'array' or jsonb_array_length(target_events) not between 1 and 100 then
    raise exception 'Invalid batch';
  end if;
  -- Serialize each installation, preserving original event order for equal timestamps.
  perform pg_advisory_xact_lock(hashtextextended(target_physical::text,0));
  for e in select value from jsonb_array_elements(target_events) loop
    if (e->'payload'->>'kind') not in ('execution','position','balance')
      or e->'payload'->>'eventId' is null then raise exception 'Invalid event'; end if;
    insert into public.ninja_event_receipts(physical_connector_id,event_id,payload_hash,payload,status,reason)
      values(target_physical,e->'payload'->>'eventId',e->>'sha256',e->'payload','pending','unresolved')
      on conflict do nothing;
    select * into strict r from public.ninja_event_receipts i
      where i.physical_connector_id=target_physical and i.event_id=e->'payload'->>'eventId' for update;
    event_id:=r.event_id; payload_hash:=e->>'sha256';
    if r.payload_hash<>e->>'sha256' or r.payload<>e->'payload' then
      status:='conflict'; reason:='event_id_reused'; return next; continue;
    end if;
    if r.status in ('persisted','excluded') then
      status:=r.status; reason:='duplicate'; return next; continue;
    end if;
    if r.status='conflict' then status:=r.status; reason:=r.reason; return next; continue; end if;
    dest:=nullif(e->>'destinationConnectorId','')::uuid;
    status:='pending'; reason:='unresolved';
    if e->>'excluded'='simulator' then
      status:='excluded'; reason:='simulator';
    elsif dest is not null then
      if not exists(select 1 from public.ninja_connector_destinations d
        join public.ninja_connectors c on c.id=d.destination_connector_id
        join public.nodal_users u on u.id=c.owner_user_id
        where d.physical_connector_id=target_physical and d.destination_connector_id=dest
        and d.destination_owner_user_id=c.owner_user_id and c.status='active' and u.access_state='active') then
        raise exception 'Destination outside installation';
      end if;
      insert into public.ninja_trade_telemetry_events(connector_id,event_id,event_type,occurred_at,connection_name,account_name,instrument,payload)
        values(dest,r.event_id,r.payload->>'kind',(r.payload->>'occurredAt')::timestamptz,
          r.payload->>'connectionName',r.payload->>'accountName',r.payload->>'instrument',r.payload)
        on conflict(connector_id,event_id) do nothing;
      select t.payload into existing_payload from public.ninja_trade_telemetry_events t
        where t.connector_id=dest and t.event_id=r.event_id;
      if existing_payload is distinct from r.payload then
        status:='conflict'; reason:='destination_event_id_reused';
      else
        status:='persisted'; reason:='stored';
        insert into public.ninja_telemetry_rebuild_jobs(connector_id) values(dest)
        on conflict(connector_id) do update set revision=ninja_telemetry_rebuild_jobs.revision+1,
          next_attempt_at=now(),updated_at=now();
      end if;
    end if;
    update public.ninja_event_receipts i set status=receive_ninja_telemetry_v2.status,
      reason=receive_ninja_telemetry_v2.reason,destination_connector_id=dest,
      updated_at=now(),next_attempt_at=now()+interval '60 seconds'
      where i.physical_connector_id=target_physical and i.event_id=r.event_id;
    return next;
  end loop;
end $$;
revoke all on function public.receive_ninja_telemetry_v2(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.receive_ninja_telemetry_v2(uuid,jsonb) to service_role;

create function public.claim_ninja_rebuild_job(target_physical uuid,target_token uuid)
returns table(connector_id uuid,revision bigint)
language sql security definer set search_path='' as $$
  with candidate as (
    select j.connector_id from public.ninja_telemetry_rebuild_jobs j
    join public.ninja_connectors c on c.id=j.connector_id
    join public.nodal_users u on u.id=c.owner_user_id
    where j.revision>j.completed_revision and j.next_attempt_at<=now()
      and (j.lease_until is null or j.lease_until<now()) and c.status='active' and u.access_state='active'
      and exists(select 1 from public.ninja_connector_destinations d
        where d.physical_connector_id=target_physical and d.destination_connector_id=j.connector_id)
    order by j.next_attempt_at,j.connector_id for update of j skip locked limit 1
  )
  update public.ninja_telemetry_rebuild_jobs j set lease_token=target_token,
    lease_until=now()+interval '5 minutes',attempts=j.attempts+1
  from candidate where j.connector_id=candidate.connector_id returning j.connector_id,j.revision;
$$;
create function public.finish_ninja_rebuild_job(target_connector uuid,target_token uuid,target_revision bigint,target_success boolean)
returns void language sql security definer set search_path='' as $$
  update public.ninja_telemetry_rebuild_jobs set
    completed_revision=case when target_success then greatest(completed_revision,least(revision,target_revision)) else completed_revision end,
    lease_token=null,lease_until=null,next_attempt_at=now()+interval '15 seconds',
    last_error=case when target_success then null else 'processing_unavailable' end,updated_at=now()
  where connector_id=target_connector and lease_token=target_token;
$$;
revoke all on function public.claim_ninja_rebuild_job(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finish_ninja_rebuild_job(uuid,uuid,bigint,boolean) from public,anon,authenticated;
grant execute on function public.claim_ninja_rebuild_job(uuid,uuid) to service_role;
grant execute on function public.finish_ninja_rebuild_job(uuid,uuid,bigint,boolean) to service_role;
