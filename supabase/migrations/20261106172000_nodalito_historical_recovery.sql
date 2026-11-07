-- Recovery uses recorded balances and explicit participants, never fabricated executions.
-- Retain the existing allocation rules, but never equate two trades by amount alone.
-- Clone only for Nodalito; leave the established app procedure unchanged.
do $$
declare definition text; needle text:='and controls.operating_result_cents = selected_batch.broker_result_cents';
begin
  definition:=pg_get_functiondef('public.assign_nodal_manual_accounts_to_ninja_batch(uuid,uuid[],boolean)'::regprocedure);
  if strpos(definition,needle)=0 then raise exception 'NODALITO_COVERAGE_SOURCE_CHANGED'; end if;
  definition:=replace(definition,'public.assign_nodal_manual_accounts_to_ninja_batch(','public.nodalito_assign_coverage_internal(');
  definition:=replace(definition,needle,needle||' and controls.source_event_key = ''ninja-operation:'' || broker_session.opening_event_id::text');
  needle:='target_balance := prior_control.balance_after_cents + selected_batch.broker_result_cents;';
  if strpos(definition,needle)=0 then raise exception 'NODALITO_COVERAGE_SOURCE_CHANGED'; end if;
  definition:=replace(definition,needle,'if selected_batch.broker_balance_scope <> ''aggregate'' and prior_control.balance_after_cents is distinct from round(broker_session.opening_balance*100)::bigint then raise exception ''NODALITO_COVERAGE_BASELINE_CHANGED''; end if; '||needle);
  execute definition;
end $$;
revoke all on function public.nodalito_assign_coverage_internal(uuid,uuid[],boolean) from public,anon,authenticated;

create function public.nodalito_rebuild_control_chain(target_period uuid, first_number integer)
returns void language plpgsql security definer set search_path='' as $$
declare c record; previous_balance bigint; result_cents bigint; share bigint; n integer; account_uuid uuid;
begin
  if not public.can_access_period(target_period) then raise exception 'NODALITO_SCOPE_FORBIDDEN'; end if;
  perform 1 from public.periods where id=target_period and lifecycle_status='open' for update;
  if not found then raise exception 'ACCOUNTING_PERIOD_CLOSED'; end if;
  select balance_after_cents into previous_balance from public.daily_controls where period_id=target_period and control_number<first_number order by control_number desc limit 1;
  if previous_balance is null then
    select broker_balance_cents into previous_balance from public.period_opening_snapshots where period_id=target_period;
    previous_balance:=coalesce(previous_balance,public.nodal_opening_broker_balance(target_period));
  end if;
  if previous_balance is null then raise exception 'NODALITO_BASELINE_MISSING'; end if;
  for c in select * from public.daily_controls where period_id=target_period and control_number>=first_number order by control_number for update loop
    if c.kind='balance_update' then
      result_cents:=c.balance_after_cents-previous_balance;
      if exists(select 1 from public.ninja_operation_batches b where b.daily_control_id=c.id and b.broker_result_cents<>result_cents) then raise exception 'NODALITO_EXECUTION_RESULT_CONFLICT'; end if;
      select count(*) into n from public.daily_control_participants where daily_control_id=c.id;
      if n=0 then raise exception 'NODALITO_PARTICIPANTS_MISSING'; end if;
      if c.allocation_reason is not null and result_cents<>c.operating_result_cents then raise exception 'NODALITO_CUSTOM_ALLOCATION_REVIEW'; end if;
      if c.allocation_reason is null then
        share:=sign(result_cents)*round(abs(result_cents)::numeric/n);
        update public.daily_control_participants set allocated_result_cents=share where daily_control_id=c.id;
        update public.operation_entries set destination=case when share>0 then 'NETO BROKER +'::public.broker_result_destination when share<0 then 'NETO BROKER -'::public.broker_result_destination else 'NONE'::public.broker_result_destination end,magnitude_cents=abs(share),updated_by=auth.uid() where daily_control_id=c.id;
      end if;
      update public.daily_controls set balance_before_cents=previous_balance,operating_result_cents=result_cents,updated_by=auth.uid() where id=c.id;
      previous_balance:=c.balance_after_cents;
    else
      result_cents:=previous_balance+case when c.kind='deposit' then c.movement_cents else -c.movement_cents end;
      if result_cents<0 then raise exception 'NODALITO_BALANCE_NEGATIVE'; end if;
      update public.daily_controls set balance_before_cents=previous_balance,balance_after_cents=result_cents,updated_by=auth.uid() where id=c.id;
      previous_balance:=result_cents;
    end if;
  end loop;
  for account_uuid in select distinct account_id from public.operation_entries where period_id=target_period loop perform public.recalculate_nodal_account_state(account_uuid); end loop;
end $$;
revoke all on function public.nodalito_rebuild_control_chain(uuid,integer) from public,anon,authenticated;

create function public.nodalito_correct_balance(target_period uuid,p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare selected_control public.daily_controls%rowtype; corrected bigint:=(p->>'balance_cents')::bigint;
begin
  if not public.can_access_period(target_period) or corrected is null or corrected<0 or length(btrim(coalesce(p->>'reason','')))<10 then raise exception 'NODALITO_BALANCE_CORRECTION_INVALID'; end if;
  perform 1 from public.periods where id=target_period and lifecycle_status='open' for update;
  if not found then raise exception 'ACCOUNTING_PERIOD_CLOSED'; end if;
  select * into selected_control from public.daily_controls where id=(p->>'daily_control_id')::uuid and period_id=target_period and kind='balance_update' for update;
  if not found then raise exception 'NODALITO_CONTROL_SCOPE'; end if;
  if selected_control.balance_after_cents=corrected then raise exception 'NODALITO_NO_ACCOUNTING_CHANGE'; end if;
  if selected_control.allocation_reason is not null then raise exception 'NODALITO_CUSTOM_ALLOCATION_REVIEW'; end if;
  update public.daily_controls set balance_after_cents=corrected,operating_result_cents=corrected-balance_before_cents,updated_by=auth.uid() where id=selected_control.id;
  perform public.nodalito_rebuild_control_chain(target_period,selected_control.control_number);
end $$;
revoke all on function public.nodalito_correct_balance(uuid,jsonb) from public,anon,authenticated;

create function public.nodalito_correct_purchase_origin(target_period uuid,p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare purchase public.purchases%rowtype; selected_wallet uuid:=(p->>'wallet_id')::uuid; space uuid;
begin
  select workspace_id into space from public.periods where id=target_period and lifecycle_status='open' and public.can_access_period(id) for update;
  if space is null then raise exception 'NODALITO_SCOPE_FORBIDDEN'; end if;
  select * into purchase from public.purchases where account_id=(p->>'account_id')::uuid and period_id=target_period for update;
  if not found or purchase.price_cents<>(p->>'price_cents')::bigint then raise exception 'NODALITO_PURCHASE_CHANGED'; end if;
  if exists(select 1 from public.period_opening_snapshots s where s.period_id=target_period and s.start_mode='reconstruct' and purchase.created_at<=coalesce(s.updated_at,s.created_at)) then raise exception 'NODALITO_OPENING_RECONSTRUCTION_REQUIRED'; end if;
  perform 1 from public.nodal_wallets where id=selected_wallet and workspace_id=space and is_active for update;
  if not found then raise exception 'NODALITO_WALLET_SCOPE'; end if;
  if public.calculate_nodal_wallet_balance(selected_wallet)+(case when purchase.wallet_id=selected_wallet then purchase.price_cents else 0 end) < purchase.price_cents then raise exception 'NODALITO_WALLET_INSUFFICIENT'; end if;
  update public.purchases set funds_origin='Saldo generado',wallet_id=selected_wallet,updated_by=auth.uid() where id=purchase.id;
end $$;
revoke all on function public.nodalito_correct_purchase_origin(uuid,jsonb) from public,anon,authenticated;

create function public.nodalito_correct_progress(target_period uuid,p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare account_uuid uuid:=(p->>'account_id')::uuid; recorded integer; target_days integer:=(p->>'completed_days')::integer; target_phase public.operation_phase:=(p->>'phase')::public.operation_phase;
begin
  if target_days is null or target_days<0 or not public.can_access_period(target_period) then raise exception 'NODALITO_PROGRESS_INVALID'; end if;
  perform 1 from public.accounts where id=account_uuid and workspace_id=(select workspace_id from public.periods where id=target_period and lifecycle_status='open') for update;
  if not found then raise exception 'NODALITO_SCOPE_FORBIDDEN'; end if;
  if exists(select 1 from public.operation_entries where account_id=account_uuid and phase>target_phase) or exists(select 1 from public.funding_withdrawals where account_id=account_uuid and is_active and phase>=target_phase) then raise exception 'NODALITO_PHASE_HISTORY_CONFLICT'; end if;
  select count(distinct daily_control_id) into recorded from public.operation_entries where account_id=account_uuid and phase=target_phase;
  if target_days<recorded then raise exception 'NODALITO_PROGRESS_LESS_THAN_RECORDED_ACTIVITY'; end if;
  update public.ninja_account_links set accounting_phase=target_phase,completed_trade_days=target_days-recorded
  where account_id=account_uuid and closed_at is null and ((phase='Evaluation' and target_phase='Evaluacion') or (phase in ('Funded','Live') and target_phase<>'Evaluacion'));
  if not found then raise exception 'NODALITO_ACTIVE_LINK_REQUIRED'; end if;
  perform public.recalculate_nodal_account_state(account_uuid);
end $$;
revoke all on function public.nodalito_correct_progress(uuid,jsonb) from public,anon,authenticated;

create function public.nodalito_recover_operation(target_period uuid,p jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  anchor public.daily_controls%rowtype; control_id uuid; account_ids uuid[]; company uuid; workspace uuid;
  new_number integer; highest integer; before_cents bigint; after_cents bigint:=(p->>'balance_cents')::bigint;
  operated date:=(p->>'operated_on')::date; phase public.operation_phase:=(p->>'phase')::public.operation_phase;
  result_cents bigint; share bigint; count_accounts integer; confirmation uuid:=nullif(current_setting('nodalito.repair_id',true),'')::uuid;
begin
  select workspace_id into workspace from public.periods where id=target_period and lifecycle_status='open' and public.can_access_period(id) for update;
  if workspace is null or not public.nodal_date_belongs_to_period(target_period,operated) or after_cents is null or after_cents<0 or length(btrim(coalesce(p->>'evidence_note','')))<10 then raise exception 'NODALITO_RECOVERY_EVIDENCE_REQUIRED'; end if;
  if exists(select 1 from public.period_opening_snapshots where period_id=target_period and cutover_date>operated) then raise exception 'NODALITO_OPERATION_BEFORE_OPENING'; end if;
  select array_agg(value::uuid) into account_ids from jsonb_array_elements_text(p->'account_ids');
  count_accounts:=cardinality(account_ids);
  if count_accounts is null or count_accounts=0 or count_accounts>250 or count_accounts<>(select count(distinct x) from unnest(account_ids) x) then raise exception 'NODALITO_PARTICIPANTS_INVALID'; end if;
  if (select count(*) from public.accounts where id=any(account_ids) and workspace_id=workspace)<>count_accounts or (select count(distinct company_id) from public.accounts where id=any(account_ids))<>1 then raise exception 'NODALITO_PARTICIPANT_SCOPE'; end if;
  if (select count(distinct coalesce(a.identity_id::text,'personal')) from unnest(account_ids) x(account_uuid) left join public.identity_account_assignments a on a.account_id=x.account_uuid and a.unassigned_at is null)>1 then raise exception 'NODALITO_MIXED_IDENTITIES'; end if;
  select company_id into company from public.accounts where id=account_ids[1];
  if nullif(p->>'after_control_id','') is null then
    new_number:=1;
    select broker_balance_cents into before_cents from public.period_opening_snapshots where period_id=target_period;
    before_cents:=coalesce(before_cents,public.nodal_opening_broker_balance(target_period));
  else
    select * into anchor from public.daily_controls where id=(p->>'after_control_id')::uuid and period_id=target_period for update;
    if not found or anchor.operated_on>operated then raise exception 'NODALITO_RECOVERY_ANCHOR_INVALID'; end if;
    new_number:=anchor.control_number+1; before_cents:=anchor.balance_after_cents;
  end if;
  if before_cents is null or before_cents<>(p->>'balance_before_cents')::bigint then raise exception 'NODALITO_RECOVERY_BASELINE_CHANGED'; end if;
  if exists(select 1 from public.daily_controls where period_id=target_period and control_number>=new_number and operated_on<operated) then raise exception 'NODALITO_RECOVERY_DATE_CONFLICT'; end if;
  if exists(select 1 from public.daily_controls c where c.period_id=target_period and c.operated_on=operated and c.balance_before_cents=before_cents and c.balance_after_cents=after_cents and exists(select 1 from public.daily_control_participants a where a.daily_control_id=c.id and a.account_id=any(account_ids))) then raise exception 'NODALITO_OPERATION_ALREADY_RECORDED'; end if;
  select coalesce(max(control_number),0)+1 into highest from public.daily_controls where period_id=target_period;
  -- Preserve IDs and links while inserting chronologically; avoid unique-index collisions.
  update public.daily_controls set control_number=control_number+highest where period_id=target_period and control_number>=new_number;
  update public.daily_controls set control_number=control_number-highest+1 where period_id=target_period and control_number>=new_number+highest;
  result_cents:=after_cents-before_cents;
  share:=sign(result_cents)*round(abs(result_cents)::numeric/count_accounts);
  insert into public.daily_controls(period_id,control_number,operated_on,kind,balance_before_cents,balance_after_cents,operating_result_cents,company_id,leader_account_id,phase,observations,source,confirmation_key,created_by)
  values(target_period,new_number,operated,'balance_update',before_cents,after_cents,result_cents,company,account_ids[1],phase,'Recuperación Nodalito: '||(p->>'evidence_note'),'manual',confirmation,auth.uid()) returning id into control_id;
  insert into public.daily_control_participants(daily_control_id,period_id,account_id,role,allocated_result_cents)
  select control_id,target_period,x.id,case when x.ordinality=1 then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,share from unnest(account_ids) with ordinality x(id,ordinality);
  insert into public.operation_entries(period_id,daily_control_id,account_id,operated_on,phase,participant_role,destination,magnitude_cents,created_by)
  select target_period,control_id,account_id,operated,phase,role,case when share>0 then 'NETO BROKER +'::public.broker_result_destination when share<0 then 'NETO BROKER -'::public.broker_result_destination else 'NONE'::public.broker_result_destination end,abs(share),auth.uid() from public.daily_control_participants where daily_control_id=control_id;
  perform public.nodalito_rebuild_control_chain(target_period,new_number);
  return control_id;
end $$;
revoke all on function public.nodalito_recover_operation(uuid,jsonb) from public,anon,authenticated;
