-- Explicit broker-only trades: no fictitious prop, contribution, or identity allocation.
alter table public.daily_controls add column is_uncovered boolean not null default false;

-- Preserve the existing covered/deposit rules verbatim; add only the broker-only shape.
do $$
declare prior_rule text;
begin
  select pg_get_expr(conbin, conrelid) into strict prior_rule from pg_constraint
  where conrelid = 'public.daily_controls'::regclass and conname = 'daily_controls_kind_shape';
  alter table public.daily_controls drop constraint daily_controls_kind_shape;
  execute 'alter table public.daily_controls add constraint daily_controls_kind_shape check (
    (not is_uncovered and (' || prior_rule || ')) or (
      is_uncovered and kind = ''balance_update'' and movement_cents is null
      and origin_destination is null and company_id is null and leader_account_id is null
      and phase is null and balance_before_cents is not null and operating_result_cents is not null
      and source = ''ninjatrader'' and source_event_key is not null
      and received_balance_cents is not null and received_balance_cents = balance_after_cents and sync_issue_reason is null
    ))';
end $$;

-- Historical balance corrections retain the independently confirmed broker result.
-- Both the current and legacy correction endpoints must obey this invariant.
do $$
declare definition text; signature regprocedure; marker text;
begin
  foreach signature in array array[
    'public.correct_nodal_daily_control_balance_with_allocations(uuid,uuid,bigint,text,jsonb)'::regprocedure,
    'public.correct_nodal_daily_control_balance(uuid,uuid,bigint,text)'::regprocedure
  ] loop
    select pg_get_functiondef(signature) into definition;
    marker := 'if target_control.balance_after_cents = target_balance_cents then';
    if strpos(definition,marker)=0 then raise exception 'Unexpected correction target validation'; end if;
    definition := replace(definition,marker,
      'if target_control.is_uncovered then raise exception ''Confirmed uncovered result is immutable''; end if; '||marker);
    marker := substring(definition from 'else[[:space:]]+if[[:space:]]+previous_balance[[:space:]]+is[[:space:]]+null[[:space:]]+then');
    if marker is null then raise exception 'Unexpected correction calculation'; end if;
    definition := replace(definition,marker,
      'elsif current_control.is_uncovered then calculated_result := current_control.operating_result_cents; calculated_after := previous_balance + calculated_result; else if previous_balance is null then');
    marker := 'operating_result_cents = calculated_result,';
    if strpos(definition,marker)=0 then raise exception 'Unexpected correction update'; end if;
    definition := replace(definition,marker,marker||' received_balance_cents = case when controls.is_uncovered then calculated_after else controls.received_balance_cents end,');
    execute definition;
  end loop;
end $$;

create function public.confirm_ninja_uncovered_trade(target_batch_id uuid, target_result_cents bigint, target_confirmed boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  b public.ninja_operation_batches%rowtype;
  s public.ninja_operation_probe_sessions%rowtype;
  prior public.daily_controls%rowtype;
  pid uuid;
  cid uuid;
  opdate date;
  closing_cents bigint;
begin
  if actor is null or target_confirmed is distinct from true then raise exception 'Explicit confirmation required'; end if;
  -- Same lock order as cross-connector deduplication.
  select sessions.* into s from public.ninja_operation_probe_sessions sessions
    join public.ninja_operation_batches batches on batches.broker_session_id = sessions.id
    join public.ninja_connectors connectors on connectors.id = batches.connector_id
    join public.nodal_users users on users.id = connectors.owner_user_id
    where batches.id = target_batch_id and connectors.owner_user_id = actor
      and connectors.status = 'active' and users.access_state = 'active'
    for update of sessions;
  if not found then raise exception 'Trade unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text || chr(31) || s.account_name, 0));
  select * into strict b from public.ninja_operation_batches where id = target_batch_id for update;
  if b.accounting_status = 'committed' then
    if exists(select 1 from public.daily_controls where id=b.daily_control_id and is_uncovered) then return b.daily_control_id; end if;
    raise exception 'Trade already allocated';
  end if;
  if b.status <> 'unmatched' or b.accounting_status <> 'blocked' or b.context_prop_count is distinct from 0
    or exists(select 1 from public.ninja_operation_batch_members where batch_id=b.id and role='prop')
    or exists(select 1 from public.ninja_operation_batch_manual_accounts where batch_id=b.id)
    then raise exception 'Trade has prop context; refresh before confirming'; end if;
  if s.status <> 'closed' or s.excluded_at is not null or s.settled_at is null
    or s.opening_balance is null or s.closing_balance is null or s.result is null
    or s.execution_count < 1 or s.settled_at > now() - interval '10 seconds'
    then raise exception 'Trade is not settled'; end if;
  if target_result_cents is distinct from b.broker_result_cents
    or round(s.result * 100)::bigint <> b.broker_result_cents
    or round(s.closing_balance*100)::bigint - round(s.opening_balance*100)::bigint <> b.broker_result_cents
    then raise exception 'Trade amount changed; refresh before confirming'; end if;
  if exists (
    select 1 from public.ninja_operation_batches other_batch
    join public.ninja_operation_probe_sessions other_session on other_session.id=other_batch.broker_session_id
    join public.ninja_connectors other_connector on other_connector.id=other_batch.connector_id
    where other_connector.owner_user_id=actor and other_batch.id<>b.id and other_session.excluded_at is null
      and other_session.account_name=s.account_name and abs(extract(epoch from (other_session.opened_at-s.opened_at)))<=5
      and other_session.direction is not distinct from s.direction and other_session.quantity=s.quantity
      and other_session.instruments=s.instruments and round(other_session.result*100)::bigint=b.broker_result_cents
      and (other_batch.accounting_status='committed' or other_batch.context_prop_count>0)
  ) then raise exception 'Trade duplicated or has prop context; refresh before confirming'; end if;
  opdate := (s.settled_at at time zone 'America/Argentina/Buenos_Aires')::date;
  select p.id into pid from public.periods p join public.workspaces w on w.id=p.workspace_id
    where w.owner_user_id=actor and w.modality='real' and p.period_month=date_trunc('month',opdate)::date
    for update of p;
  if pid is null then raise exception 'Period unavailable'; end if;
  select * into prior from public.daily_controls where period_id=pid order by control_number desc limit 1 for update;
  if not found then raise exception 'Broker opening balance missing'; end if;
  if prior.operated_on > opdate or exists (
    select 1 from public.ninja_operation_batches later where later.accounting_period_id=pid
      and later.accounting_status='committed' and later.opened_at > b.opened_at
  ) then raise exception 'Historical trade requires controlled correction'; end if;
  if b.broker_balance_scope='single' and prior.balance_after_cents <> round(s.opening_balance*100)::bigint
    then raise exception 'Resolve earlier broker movements first'; end if;
  closing_cents := prior.balance_after_cents + b.broker_result_cents;
  insert into public.daily_controls(period_id,control_number,operated_on,kind,balance_before_cents,
    balance_after_cents,operating_result_cents,source,source_event_key,received_balance_cents,
    confirmation_key,created_by,observations,is_uncovered)
  values(pid,prior.control_number+1,opdate,'balance_update',prior.balance_after_cents,
    closing_cents,b.broker_result_cents,'ninjatrader','ninja-operation:'||s.opening_event_id,
    closing_cents,b.id,actor,'Trade de broker sin cobertura confirmado por el usuario.',true)
  returning id into cid;
  update public.ninja_operation_batches set accounting_status='committed',accounting_mode='active',
    accounting_blocking_reason=null,accounting_period_id=pid,daily_control_id=cid,
    accounting_company_id=null,accounting_phase=null,distributed_cents=0,rounding_difference_cents=0,
    operated_on=opdate,updated_at=now() where id=b.id;
  update public.ninja_broker_balance_events set status='confirmed',daily_control_id=cid,resolved_at=now()
    where connector_id=b.connector_id and source_event_id='ninja-operation:'||s.opening_event_id;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
    values(actor,'daily_controls',cid,'ninja_uncovered_trade_confirmed',
      jsonb_build_object('batch_id',b.id,'broker_session_id',s.id,'result_cents',b.broker_result_cents,
        'opening_cents',round(s.opening_balance*100),'closing_cents',round(s.closing_balance*100),
        'broker_balance_scope',b.broker_balance_scope), 'Confirmación explícita de trade sin cobertura; sin cuentas prop.');
  return cid;
end $$;
revoke all on function public.confirm_ninja_uncovered_trade(uuid,bigint,boolean) from public,anon;
grant execute on function public.confirm_ninja_uncovered_trade(uuid,bigint,boolean) to authenticated;

-- A late background recomputation must never overwrite a confirmed trade.
do $$
declare definition text; marker text := 'has_current_batch := found;';
begin
  select pg_get_functiondef(p.oid) into strict definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='upsert_nodal_deduplicated_operation_batch';
  if strpos(definition,marker)=0 then raise exception 'Unexpected deduplication function'; end if;
  execute replace(definition,marker,marker || E'\n  if has_current_batch and current_batch.accounting_status = ''committed'' then\n    return query select current_batch.id, false;\n    return;\n  end if;');
end $$;

create function public.replace_pending_ninja_batch_members(target_batch_id uuid, target_members jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare b public.ninja_operation_batches%rowtype;
begin
  select * into strict b from public.ninja_operation_batches where id=target_batch_id for update;
  if b.accounting_status='committed' then return false; end if;
  delete from public.ninja_operation_batch_members where batch_id=b.id;
  insert into public.ninja_operation_batch_members(batch_id,session_id,account_id,role,allocated_broker_result_cents)
    select b.id,x.session_id,x.account_id,x.role,x.allocated_broker_result_cents
    from jsonb_to_recordset(target_members) as x(session_id bigint,account_id uuid,role text,allocated_broker_result_cents bigint);
  return true;
end $$;
revoke all on function public.replace_pending_ninja_batch_members(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.replace_pending_ninja_batch_members(uuid,jsonb) to service_role;

-- Serialize all broker ledger inserts with the period lock used by manual confirmation.
do $$
declare definition text; marker text := 'select * into prior_control';
begin
  select pg_get_functiondef('public.commit_ninja_automatic_operation_batch(uuid)'::regprocedure) into definition;
  if strpos(definition,marker)=0 then raise exception 'Unexpected automatic commit function'; end if;
  execute replace(definition,marker,'perform 1 from public.periods where id=selected_batch.accounting_period_id for update; '||marker);
end $$;
