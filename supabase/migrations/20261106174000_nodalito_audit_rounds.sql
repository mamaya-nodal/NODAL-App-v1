grant select on public.nodalito_repair_access to service_role;
create function public.record_nodalito_audit_finding(target_owner uuid,finding_key text,finding_title text,finding_description text,finding_evidence jsonb,finding_priority text)
returns uuid language plpgsql security definer set search_path='' as $$
declare case_id uuid;
begin
  if not exists(select 1 from public.nodalito_repair_access where user_id=target_owner and enabled) then raise exception 'NODALITO_REPAIRS_DISABLED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_owner::text||finding_key,0));
  select id into case_id from public.nodal_agent_cases where subject_user_id=target_owner and category='scheduled_audit' and source_question=finding_key and status in('open','investigating') order by created_at desc limit 1;
  if case_id is not null then
    update public.nodal_agent_cases set evidence=finding_evidence,description=finding_description,updated_at=now() where id=case_id;
    return case_id;
  end if;
  insert into public.nodal_agent_cases(reporter_user_id,subject_user_id,status,priority,category,title,description,source_question,evidence)
  values(target_owner,target_owner,'open',finding_priority,'scheduled_audit',finding_title,finding_description,finding_key,finding_evidence) returning id into case_id;
  return case_id;
end $$;
revoke all on function public.record_nodalito_audit_finding(uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_nodalito_audit_finding(uuid,text,text,text,jsonb,text) to service_role;
