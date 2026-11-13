-- Receipt storage is independent of economic posting. Recognized shared brokers
-- receive a narrow authorization; prop accounts never inherit that exception.
begin;
alter table public.ninja_operation_probe_sessions add column if not exists result_verified boolean not null default false;
alter table public.ninja_operation_probe_sessions add column if not exists result_conflict boolean not null default false;
alter table public.ninja_telemetry_rebuild_jobs add column if not exists replay_since timestamptz;
alter table public.ninja_telemetry_rebuild_jobs add column if not exists replay_pending_since timestamptz;

create or replace function public.get_ninja_replay_accounts(target_connector uuid,target_since timestamptz)
returns table(connection_name text,account_name text) language sql stable security definer set search_path='' as $$
  select distinct e.connection_name,e.account_name from public.ninja_trade_telemetry_events e
    where e.connector_id=target_connector and e.occurred_at>=target_since;
$$;
revoke all on function public.get_ninja_replay_accounts(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.get_ninja_replay_accounts(uuid,timestamptz) to service_role;

create or replace function public.ninja_shared_broker_destination_allowed(physical uuid, destination uuid, payload jsonb)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.ninja_account_ownership o
    join public.ninja_connectors p on p.id=o.physical_connector_id
    join public.ninja_connectors d on d.id=o.destination_connector_id
    join public.nodal_users u on u.id=d.owner_user_id
    where p.id=physical and d.id=destination and o.account_type='broker'
      and o.account_name=payload->>'accountName' and o.connection_name=payload->>'connectionName'
      and p.owner_user_id=d.owner_user_id and o.owner_user_id=d.owner_user_id
      and d.identity_id is null and d.status='active' and u.access_state='active'
  );
$$;
revoke all on function public.ninja_shared_broker_destination_allowed(uuid,uuid,jsonb) from public,anon,authenticated;

do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.receive_ninja_telemetry_v2(uuid,jsonb)'::regprocedure) into definition;
  if strpos(definition,'NODAL_SHARED_BROKER_RECEIPT_V1')=0 then
    if strpos(definition,'raise exception ''Destination outside installation'';')=0 then
      raise exception 'Unexpected receipt authorization definition';
    end if;
    -- Preserve an unresolved receipt and let the rest of the batch proceed.
    definition := replace(definition,
      'raise exception ''Destination outside installation'';',
      E'-- NODAL_SHARED_BROKER_RECEIPT_V1\n'
      || 'if not public.ninja_shared_broker_destination_allowed(target_physical,dest,r.payload) then '
      || 'status:=''pending''; reason:=''destination_not_authorized''; '
      || 'update public.ninja_event_receipts i set status=''pending'',reason=receive_ninja_telemetry_v2.reason,'
      || 'destination_connector_id=null,updated_at=now(),next_attempt_at=now()+interval ''60 seconds'' '
      || 'where i.physical_connector_id=target_physical and i.event_id=r.event_id; '
      || 'return next; continue; end if;');
    if strpos(definition,'insert into public.ninja_telemetry_rebuild_jobs(connector_id) values(dest)')=0 then
      raise exception 'Unexpected receipt rebuild definition';
    end if;
    definition := replace(definition,
      'insert into public.ninja_telemetry_rebuild_jobs(connector_id) values(dest)',
      'insert into public.ninja_telemetry_rebuild_jobs(connector_id,replay_since) values(dest,(r.payload->>''occurredAt'')::timestamptz)');
    definition := replace(definition,
      'next_attempt_at=now(),updated_at=now();',
      'replay_since=least(ninja_telemetry_rebuild_jobs.replay_since,excluded.replay_since),'
      || 'replay_pending_since=case when ninja_telemetry_rebuild_jobs.lease_token is not null '
      || 'then least(ninja_telemetry_rebuild_jobs.replay_pending_since,excluded.replay_since) '
      || 'else ninja_telemetry_rebuild_jobs.replay_pending_since end,next_attempt_at=now(),updated_at=now();');
    execute definition;
  end if;
end $migration$;

drop function public.claim_ninja_rebuild_job(uuid,uuid);
create function public.claim_ninja_rebuild_job(target_physical uuid,target_token uuid)
returns table(connector_id uuid,revision bigint,replay_since timestamptz)
language sql security definer set search_path='' as $$
  with candidate as (
    select j.connector_id from public.ninja_telemetry_rebuild_jobs j
    join public.ninja_connectors c on c.id=j.connector_id
    join public.nodal_users u on u.id=c.owner_user_id
    join public.ninja_connectors p on p.id=target_physical
    where j.revision>j.completed_revision and j.next_attempt_at<=now()
      and (j.lease_until is null or j.lease_until<now()) and c.status='active' and u.access_state='active'
      and p.status='active' and (
        exists(select 1 from public.ninja_connector_destinations d
          where d.physical_connector_id=p.id and d.destination_connector_id=j.connector_id)
        or (c.identity_id is null and c.owner_user_id=p.owner_user_id and exists (
          select 1 from public.ninja_account_ownership o where o.physical_connector_id=p.id
            and o.destination_connector_id=c.id and o.owner_user_id=c.owner_user_id and o.account_type='broker')))
    order by j.next_attempt_at,j.connector_id for update of j skip locked limit 1
  ) update public.ninja_telemetry_rebuild_jobs j set lease_token=target_token,replay_pending_since=null,
    lease_until=now()+interval '5 minutes',attempts=j.attempts+1
    from candidate where j.connector_id=candidate.connector_id returning j.connector_id,j.revision,j.replay_since;
$$;
revoke all on function public.claim_ninja_rebuild_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_ninja_rebuild_job(uuid,uuid) to service_role;

create or replace function public.finish_ninja_rebuild_job_page(target_connector uuid,target_token uuid,target_revision bigint,target_success boolean,target_replay_since timestamptz)
returns void language sql security definer set search_path='' as $$
  update public.ninja_telemetry_rebuild_jobs set
    replay_since=case when not target_success then replay_since
      when target_replay_since is not null then least(target_replay_since,replay_pending_since)
      when revision>target_revision then coalesce(replay_pending_since,replay_since) else null end,
    replay_pending_since=null,
    completed_revision=case when target_success and target_replay_since is null
      then greatest(completed_revision,least(revision,target_revision)) else completed_revision end,
    lease_token=null,lease_until=null,next_attempt_at=now()+interval '15 seconds',
    last_error=case when target_success then null else 'processing_unavailable' end,updated_at=now()
  where connector_id=target_connector and lease_token=target_token;
$$;
revoke all on function public.finish_ninja_rebuild_job_page(uuid,uuid,bigint,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.finish_ninja_rebuild_job_page(uuid,uuid,bigint,boolean,timestamptz) to service_role;
create or replace function public.finish_ninja_rebuild_job(target_connector uuid,target_token uuid,target_revision bigint,target_success boolean)
returns void language sql security definer set search_path='' as $$
  select public.finish_ninja_rebuild_job_page(target_connector,target_token,target_revision,target_success,null);
$$;
commit;
