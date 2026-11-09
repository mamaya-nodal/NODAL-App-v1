-- Rondas globales de auditoría determinística para Admin Master.
-- El permiso de reparación continúa separado en nodalito_repair_access.

create table public.nodalito_audit_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','partial','failed')),
  target_count integer not null default 0 check (target_count >= 0),
  reviewed_count integer not null default 0 check (reviewed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  critical_count integer not null default 0 check (critical_count >= 0),
  attention_count integer not null default 0 check (attention_count >= 0),
  informational_count integer not null default 0 check (informational_count >= 0),
  opened_case_count integer not null default 0 check (opened_case_count >= 0),
  failures jsonb not null default '[]'::jsonb,
  constraint nodalito_audit_run_finish check (
    (status='running' and finished_at is null)
    or (status<>'running' and finished_at is not null)
  )
);

create index nodalito_audit_runs_started_idx on public.nodalito_audit_runs(started_at desc);
alter table public.nodalito_audit_runs enable row level security;
revoke all on public.nodalito_audit_runs from public,anon,authenticated;
grant select,insert,update on public.nodalito_audit_runs to service_role;

create or replace function public.record_nodalito_audit_finding(target_owner uuid,finding_key text,finding_title text,finding_description text,finding_evidence jsonb,finding_priority text)
returns uuid language plpgsql security definer set search_path='' as $$
declare case_id uuid;
begin
  if not exists(select 1 from public.nodal_users where id=target_owner and access_state='active') then
    raise exception 'NODALITO_AUDIT_TARGET_INACTIVE';
  end if;
  if finding_priority not in ('normal','high','critical') then raise exception 'NODALITO_AUDIT_PRIORITY_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_owner::text||finding_key,0));
  select id into case_id from public.nodal_agent_cases
  where subject_user_id=target_owner and category='scheduled_audit' and source_question=finding_key
    and status in('open','investigating') order by created_at desc limit 1;
  if case_id is not null then
    update public.nodal_agent_cases set evidence=finding_evidence,description=finding_description,
      priority=finding_priority,updated_at=now() where id=case_id;
    return case_id;
  end if;
  insert into public.nodal_agent_cases(reporter_user_id,subject_user_id,status,priority,category,title,description,source_question,evidence)
  values(target_owner,target_owner,'open',finding_priority,'scheduled_audit',finding_title,finding_description,finding_key,finding_evidence)
  returning id into case_id;
  return case_id;
end $$;

create function public.resolve_nodalito_audit_findings(target_owner uuid,active_keys text[],audit_run uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  if not exists(select 1 from public.nodal_users where id=target_owner and access_state='active') then
    raise exception 'NODALITO_AUDIT_TARGET_INACTIVE';
  end if;
  update public.nodal_agent_cases set
    status='resolved',
    resolution_note='La siguiente ronda completa ya no reprodujo esta alerta.',
    evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('resolvedByAuditRun',audit_run),
    updated_at=now()
  where subject_user_id=target_owner and category='scheduled_audit'
    and status in('open','investigating')
    and not (source_question=any(coalesce(active_keys,'{}'::text[])));
  get diagnostics affected=row_count;
  return affected;
end $$;

revoke all on function public.record_nodalito_audit_finding(uuid,text,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.resolve_nodalito_audit_findings(uuid,text[],uuid) from public,anon,authenticated;
grant execute on function public.record_nodalito_audit_finding(uuid,text,text,text,jsonb,text) to service_role;
grant execute on function public.resolve_nodalito_audit_findings(uuid,text[],uuid) to service_role;
