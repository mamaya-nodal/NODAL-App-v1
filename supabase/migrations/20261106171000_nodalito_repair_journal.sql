-- Every write produced by a repair, including dependent trigger writes, is journaled.
alter table public.nodalito_repair_plans add column simulation jsonb, add column failure_reason text;
create table public.nodalito_repair_changes (
  sequence bigint generated always as identity primary key,
  plan_id uuid not null references public.nodalito_repair_plans(id),
  entity_table text not null,
  row_key jsonb not null,
  before_data jsonb,
  after_data jsonb
);
alter table public.nodalito_repair_changes enable row level security;
revoke all on public.nodalito_repair_changes from public,anon,authenticated;
create index on public.nodalito_repair_changes(plan_id,sequence);

create function public.nodalito_capture_repair_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare plan_id uuid; row_data jsonb; key_data jsonb;
begin
  if current_setting('nodalito.repair_mode',true) is distinct from 'apply' then return coalesce(new,old); end if;
  plan_id:=nullif(current_setting('nodalito.repair_id',true),'')::uuid;
  if plan_id is null then return coalesce(new,old); end if;
  if not exists(select 1 from public.nodalito_repair_plans where id=plan_id and owner_user_id=auth.uid()) then raise exception 'NODALITO_JOURNAL_SCOPE'; end if;
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  select jsonb_object_agg(a.attname,row_data->a.attname) into key_data
  from pg_catalog.pg_index i join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
  where i.indrelid=tg_relid and i.indisprimary;
  if key_data is null then raise exception 'NODALITO_JOURNAL_KEY_MISSING'; end if;
  insert into public.nodalito_repair_changes(plan_id,entity_table,row_key,before_data,after_data)
  values(plan_id,tg_table_name,key_data,case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
  return coalesce(new,old);
end $$;
revoke all on function public.nodalito_capture_repair_change() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['ninja_account_ownership','accounts','purchases','daily_controls','daily_control_participants','operation_entries','account_phase_withdrawals','funding_withdrawals','wallet_movements','ninja_account_links','identity_account_assignments','ninja_operation_batches','ninja_operation_batch_members','ninja_operation_batch_manual_accounts','ninja_broker_balance_events'] loop
    execute format('create trigger zz_nodalito_journal after insert or update or delete on public.%I for each row execute function public.nodalito_capture_repair_change()',t);
  end loop;
end $$;

create function public.nodalito_check_repair(target_plan uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_period_id uuid; wallet_id uuid; c record; actual bigint; n integer;
begin
  select p.period_id into v_period_id from public.nodalito_repair_plans p where p.id=target_plan;
  for c in select d.* from public.daily_controls d where d.period_id=v_period_id and d.kind='balance_update'
    and exists(select 1 from public.nodalito_repair_changes j where j.plan_id=target_plan and
      ((j.entity_table='daily_controls' and j.row_key->>'id'=d.id::text) or (j.entity_table in ('operation_entries','daily_control_participants') and coalesce(j.after_data,j.before_data)->>'daily_control_id'=d.id::text)))
  loop
    select count(*),sum(allocated_result_cents) into n,actual from public.daily_control_participants where daily_control_id=c.id;
    if n=0 or (c.allocation_reason is not null and actual<>c.operating_result_cents)
      or (c.allocation_reason is null and abs(actual-c.operating_result_cents)>ceil(n::numeric/2)) then raise exception 'NODALITO_ALLOCATION_MISMATCH'; end if;
    if exists(select 1 from public.daily_control_participants p left join public.operation_entries e on e.daily_control_id=p.daily_control_id and e.account_id=p.account_id
      where p.daily_control_id=c.id and (e.id is null or (case e.destination when 'NETO BROKER +' then e.magnitude_cents when 'NETO BROKER -' then -e.magnitude_cents else 0 end)<>p.allocated_result_cents)) then raise exception 'NODALITO_LEDGER_MISMATCH'; end if;
  end loop;
  for wallet_id in select distinct nullif(coalesce(j.after_data,j.before_data)->>'wallet_id','')::uuid from public.nodalito_repair_changes j where j.plan_id=target_plan and coalesce(j.after_data,j.before_data)->>'wallet_id' is not null loop
    if public.calculate_nodal_wallet_balance(wallet_id)<0 then raise exception 'NODALITO_WALLET_INSUFFICIENT'; end if;
  end loop;
end $$;
revoke all on function public.nodalito_check_repair(uuid) from public,anon,authenticated;

alter function public.apply_nodalito_repair(uuid) rename to nodalito_apply_repair_internal;
revoke all on function public.nodalito_apply_repair_internal(uuid) from public,anon,authenticated;
create function public.apply_nodalito_repair(target_plan_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; total integer;
begin
  if exists(select 1 from public.nodalito_repair_plans where id=target_plan_id and owner_user_id=auth.uid() and status='applied') then
    return (select receipt from public.nodalito_repair_plans where id=target_plan_id);
  end if;
  perform set_config('nodalito.repair_id',target_plan_id::text,true);
  perform set_config('nodalito.repair_mode','apply',true);
  result:=public.nodalito_apply_repair_internal(target_plan_id);
  perform public.nodalito_check_repair(target_plan_id);
  select count(*) into total from public.nodalito_repair_changes where plan_id=target_plan_id;
  if total=0 then raise exception 'NODALITO_NO_ACCOUNTING_CHANGE'; end if;
  result:=result||jsonb_build_object('changedRecords',total);
  update public.nodal_agent_cases set evidence=evidence||jsonb_build_object('changes',(
    select coalesce(jsonb_agg(jsonb_build_object('table',entity_table,'before',before_data,'after',after_data) order by sequence),'[]') from public.nodalito_repair_changes where plan_id=target_plan_id
  )) where id=(select case_id from public.nodalito_repair_plans where id=target_plan_id);
  update public.nodalito_repair_plans set receipt=result where id=target_plan_id;
  perform set_config('nodalito.repair_mode','',true);
  return result;
end $$;
revoke all on function public.apply_nodalito_repair(uuid) from public,anon;
grant execute on function public.apply_nodalito_repair(uuid) to authenticated;

alter function public.prepare_nodalito_repair(uuid,text,jsonb) rename to nodalito_prepare_repair_internal;
revoke all on function public.nodalito_prepare_repair_internal(uuid,text,jsonb) from public,anon,authenticated;
create function public.prepare_nodalito_repair(target_period_id uuid,target_action text,target_parameters jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare prepared_plan uuid; changes jsonb; failure text; review_id uuid;
begin
  prepared_plan:=public.nodalito_prepare_repair_internal(target_period_id,target_action,target_parameters);
  begin
    perform public.apply_nodalito_repair(prepared_plan);
    select coalesce(jsonb_agg(jsonb_build_object('table',entity_table,'key',row_key,'before',before_data,'after',after_data) order by sequence),'[]') into changes from public.nodalito_repair_changes where plan_id=prepared_plan;
    raise exception using errcode='P0N01',message='NODALITO_SIMULATION_ROLLBACK';
  exception when sqlstate 'P0N01' then null;
    when others then failure:=sqlerrm;
  end;
  -- The inner transaction has rolled back all ledger writes and notifications.
  if failure is not null then
    update public.nodalito_repair_plans set status='needs_review',failure_reason=failure where id=prepared_plan;
    insert into public.nodal_agent_cases(reporter_user_id,subject_user_id,status,priority,category,title,description,evidence)
    values(auth.uid(),auth.uid(),'open','normal','nodalito_repair_review','Corrección pendiente de revisión',
      'La simulación no validó la corrección. No se aplicaron cambios contables.',
      jsonb_build_object('planId',prepared_plan,'action',target_action,'parameters',target_parameters,'simulationFailure',failure)) returning id into review_id;
    update public.nodalito_repair_plans set case_id=review_id where id=prepared_plan;
  else
    update public.nodalito_repair_plans set simulation=changes where id=prepared_plan;
  end if;
  return prepared_plan;
end $$;
revoke all on function public.prepare_nodalito_repair(uuid,text,jsonb) from public,anon;
grant execute on function public.prepare_nodalito_repair(uuid,text,jsonb) to authenticated;

create function public.get_nodalito_repair(target_plan_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',p.id,'action',p.action,'status',p.status,'parameters',p.parameters,'simulation',p.simulation,'receipt',p.receipt,'failure',p.failure_reason,'expiresAt',p.expires_at,
    'walletName',(select name from public.nodal_wallets where id=nullif(p.parameters->>'wallet_id','')::uuid and workspace_id=(select workspace_id from public.periods where id=p.period_id)),
    'accountNames',(select coalesce(jsonb_agg(coalesce((select external_account_name from public.ninja_account_links where account_id=a.id order by linked_at desc limit 1),'Cuenta '||a.reference_number)),'[]') from public.accounts a where a.workspace_id=(select workspace_id from public.periods where id=p.period_id) and (a.id::text=p.parameters->>'account_id' or coalesce(p.parameters->'account_ids','[]') ? a.id::text)))
  from public.nodalito_repair_plans p where p.id=target_plan_id and (p.owner_user_id=auth.uid() or public.is_current_user_admin());
$$;
revoke all on function public.get_nodalito_repair(uuid) from public,anon;
grant execute on function public.get_nodalito_repair(uuid) to authenticated;
