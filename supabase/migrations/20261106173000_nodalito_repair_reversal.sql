-- Reversal restores only the recorded writes. Later activity requires a new reconstruction.
create function public.revert_nodalito_repair(target_plan_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.nodalito_repair_plans%rowtype; change record; current_row jsonb; assignments text; columns_list text; result jsonb;
begin
  if not public.is_current_user_admin() then raise exception 'NODALITO_MASTER_MFA_REQUIRED'; end if;
  select * into p from public.nodalito_repair_plans where id=target_plan_id for update;
  if not found then raise exception 'NODALITO_PLAN_NOT_FOUND'; end if;
  if p.status='reverted' then return p.receipt; end if;
  if p.status<>'applied' then raise exception 'NODALITO_NOT_APPLIED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p.owner_user_id::text,0));
  perform 1 from public.periods where id=p.period_id and lifecycle_status='open' for update;
  if not found then raise exception 'ACCOUNTING_PERIOD_CLOSED'; end if;
  -- Lock every affected relation before checking dependencies; no client supplied table names.
  for change in select distinct entity_table from public.nodalito_repair_changes where plan_id=p.id order by entity_table loop
    execute format('lock table public.%I in share row exclusive mode',change.entity_table);
  end loop;
  -- Any ledger change in this workspace since application requires explicit reconstruction.
  if public.nodalito_repair_snapshot(p.period_id) is distinct from
    (select evidence->'after' from public.nodal_agent_cases where id=p.case_id) then
    return jsonb_build_object('status','needs_review','message','Hay actividad posterior. La reversión necesita reconstrucción para conservarla.');
  end if;
  perform set_config('nodalito.repair_mode','revert',true);
  for change in select * from public.nodalito_repair_changes where plan_id=p.id order by sequence desc loop
    if change.entity_table not in ('ninja_account_ownership','accounts','purchases','daily_controls','daily_control_participants','operation_entries','account_phase_withdrawals','funding_withdrawals','wallet_movements','ninja_account_links','identity_account_assignments','ninja_operation_batches','ninja_operation_batch_members','ninja_operation_batch_manual_accounts','ninja_broker_balance_events') then raise exception 'NODALITO_INVALID_JOURNAL'; end if;
    execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1',change.entity_table) into current_row using change.row_key;
    if (current_row - array['updated_at','updated_by']) is not distinct from (change.before_data - array['updated_at','updated_by']) then continue; end if;
    if change.before_data is null then
      execute format('delete from public.%I t where to_jsonb(t) @> $1',change.entity_table) using change.row_key;
    else
      select string_agg(format('%I',a.attname),','),string_agg(format('%1$I=r.%1$I',a.attname),',') into columns_list,assignments
      from pg_catalog.pg_attribute a where a.attrelid=format('public.%I',change.entity_table)::regclass and a.attnum>0 and not a.attisdropped and a.attgenerated='' and a.attidentity='';
      if current_row is null then
        execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1)',change.entity_table,columns_list) using change.before_data;
      else
        execute format('update public.%1$I t set %2$s from jsonb_populate_record(null::public.%1$I,$1) r where to_jsonb(t) @> $2',change.entity_table,assignments) using change.before_data,change.row_key;
      end if;
    end if;
  end loop;
  result:=jsonb_build_object('planId',p.id,'status','reverted','revertedAt',now());
  update public.nodalito_repair_plans set status='reverted',receipt=result where id=p.id;
  update public.nodal_agent_cases set resolution_note='Revertida por Admin Master',evidence=evidence||jsonb_build_object('reversal',result) where id=p.case_id;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,previous_data,current_data,reason)
  values(auth.uid(),'nodalito_repair_plans',p.id,'nodalito_repair_reverted',p.receipt,result,'Reversión solicitada por Admin Master');
  perform set_config('nodalito.repair_mode','',true);
  return result;
end $$;
revoke all on function public.revert_nodalito_repair(uuid) from public,anon;
grant execute on function public.revert_nodalito_repair(uuid) to authenticated;
