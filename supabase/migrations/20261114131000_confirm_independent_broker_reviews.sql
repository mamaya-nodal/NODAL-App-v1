begin;
create schema if not exists private_broker_reviews_20261114;
revoke all on schema private_broker_reviews_20261114 from public,anon,authenticated;
create table if not exists private_broker_reviews_20261114.backup(name text primary key,definition text not null);
alter table private_broker_reviews_20261114.backup enable row level security;
revoke all on table private_broker_reviews_20261114.backup from public,anon,authenticated;

do $migration$
declare definition text; updated_definition text;
begin
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid='public.daily_controls'::regclass and conname='daily_controls_kind_shape';
  insert into private_broker_reviews_20261114.backup values('daily_controls_kind_shape',definition) on conflict do nothing;
  if strpos(definition,'received_balance_cents IS NOT NULL')=0 or position('received_balance_cents IS NOT NULL' in definition)>position('balance_update' in definition) then
    -- Only the deposit/withdrawal branch gains received-cash metadata. Its
    -- amount, classification and accounting balance remain manual/unchanged.
    updated_definition:=regexp_replace(definition,
      '\(received_balance_cents IS NULL\) AND \(sync_issue_reason IS NULL\)',
      '((received_balance_cents IS NULL AND sync_issue_reason IS NULL) OR (received_balance_cents IS NOT NULL AND ((received_balance_cents=balance_after_cents AND sync_issue_reason IS NULL) OR (received_balance_cents<>balance_after_cents AND sync_issue_reason IS NOT NULL))))');
    if definition=updated_definition then raise exception 'Unexpected daily control shape'; end if;
    execute 'alter table public.daily_controls drop constraint daily_controls_kind_shape';
    execute 'alter table public.daily_controls add constraint daily_controls_kind_shape '||updated_definition;
  end if;

  select pg_get_functiondef('public.reconcile_nodal_preoperation_broker_transfer(uuid,uuid,uuid,date,text,bigint,text)'::regprocedure) into definition;
  insert into private_broker_reviews_20261114.backup values('reconcile_nodal_preoperation_broker_transfer',definition) on conflict do nothing;
  definition:=replace(definition,E'\r','');
  definition:=regexp_replace(definition,E'\n[ \t]+',E'\n','g');
  if strpos(definition,'NODAL_INDEPENDENT_TRANSFER_V1')=0 then
    updated_definition:=replace(definition,'latest_balance bigint;',
      E'  latest_balance bigint;\n  current_received bigint;\n  latest_control_at timestamptz;\n  transfer_delta bigint;\n  accounting_target bigint; -- NODAL_INDEPENDENT_TRANSFER_V1');
    updated_definition:=replace(updated_definition,
      'select controls.balance_after_cents into latest_balance',
      'select controls.balance_after_cents, coalesce(controls.received_balance_cents,controls.balance_after_cents),controls.created_at into latest_balance,current_received,latest_control_at');
    updated_definition:=replace(updated_definition,
      E'if expected_balance is null or latest_balance is distinct from expected_balance then\nraise exception ''PREOPERATION_TRANSFER_BASELINE_CHANGED'';\nend if;',
      E'  if expected_balance is null or latest_balance is null then raise exception ''PREOPERATION_TRANSFER_BASELINE_CHANGED''; end if;\n'
      || E'  transfer_delta:=selected_event.balance_cents-expected_balance;\n'
      || E'  if transfer_delta=0 then raise exception ''PREOPERATION_TRANSFER_BASELINE_CHANGED''; end if;\n'
      || E'  if latest_balance=expected_balance and current_received=latest_balance and latest_control_at<=selected_event.observed_at then\n    current_received:=selected_event.balance_cents;\n'
      || E'  elsif sign(current_received-latest_balance)<>sign(transfer_delta) or abs(current_received-latest_balance)<abs(transfer_delta) then\n'
      || E'    raise exception ''PREOPERATION_TRANSFER_REVIEW_REQUIRED'';\n  end if;\n'
      || E'  accounting_target:=latest_balance+transfer_delta;\n'
      || E'  if accounting_target<0 then raise exception ''PREOPERATION_TRANSFER_REVIEW_REQUIRED''; end if;');
    updated_definition:=replace(updated_definition,
      E'''observed_balance_cents'', selected_event.balance_cents,',
      E'      ''observed_balance_cents'', selected_event.balance_cents,\n      ''transfer_delta_cents'',transfer_delta,\n      ''current_received_balance_cents'',current_received,\n      ''accounting_target_cents'',accounting_target,');
    updated_definition:=replace(updated_definition,
      E'selected_event.balance_cents,\ntarget_fee_cents,',
      E'    accounting_target,\n    target_fee_cents,');
    updated_definition:=replace(updated_definition,
      E'update public.ninja_broker_balance_events\nset status',
      E'  update public.daily_controls set received_balance_cents=current_received,\n'
      || E'    sync_issue_reason=case when current_received=balance_after_cents then null else ''Diferencia anterior pendiente de clasificación.'' end\n'
      || E'    where id=created_control_id;\n\n'
      || E'  update public.ninja_broker_balance_events\n  set status');
    if strpos(updated_definition,'PREOPERATION_TRANSFER_REVIEW_REQUIRED')=0
      or strpos(updated_definition,E'selected_event.balance_cents,\ntarget_fee_cents,')>0
      or strpos(updated_definition,'where id=created_control_id')=0 then raise exception 'Unexpected transfer reconciliation definition'; end if;
    execute updated_definition;
  end if;
end $migration$;
commit;
