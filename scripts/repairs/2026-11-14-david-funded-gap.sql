-- Two omitted Sebastian Funded operations. No synthetic trade telemetry,
-- transfer, purchase or payout. Rebase subsequent controls in economic order.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set constraints all deferred;
create schema if not exists private_david_gap_20261114;
revoke all on schema private_david_gap_20261114 from public,anon,authenticated;
create table if not exists private_david_gap_20261114.before_rows(
  table_name text not null,row_key text not null,before_row jsonb not null,
  primary key(table_name,row_key)
);
alter table private_david_gap_20261114.before_rows enable row level security;
revoke all on table private_david_gap_20261114.before_rows from public,anon,authenticated;

do $repair$
declare
  target_period constant uuid:='f028cd3d-aef3-45b5-a088-fa92e54c70e9';
  owner_id constant uuid:='b1afb804-fb3f-4424-b9ab-5e0e0b0ec887';
  admin_id constant uuid:='f2f5f816-ec4f-46e1-b216-5267aeadc635';
  lucid_company constant uuid:='31f7ac9f-21c4-4322-b188-a6af31d882bd';
  sebastian constant uuid:='2d0b2a67-4861-4409-9393-825360da285f';
  broker constant uuid:='2f930da1-480c-46e9-a435-b2d5e1c5a2ad';
  account_ids uuid[]; target_account uuid; leader uuid; new_control uuid;
  item record; recovered_ids uuid[]:=array[]::uuid[];
begin
  perform 1 from public.periods where id=target_period and lifecycle_status='open' for update;
  if not found then raise exception 'DAVID_REPAIR_PERIOD_NOT_OPEN'; end if;
  if exists(select 1 from public.audit_events where entity_id=target_period and action='david_sebastian_funded_gap_repaired_20261114') then return; end if;
  perform 1 from public.daily_controls where period_id=target_period for update;
  if (select count(*) from public.daily_controls where period_id=target_period)<>26
    or not exists(select 1 from public.daily_controls where period_id=target_period and control_number=26 and balance_after_cents=907466 and received_balance_cents=622866)
    or not exists(select 1 from public.daily_controls where period_id=target_period and control_number=20 and balance_after_cents=930736 and received_balance_cents=930736)
  then raise exception 'DAVID_REPAIR_BASELINE_CHANGED'; end if;

  select array_agg(l.account_id order by l.external_account_name) into account_ids
  from public.ninja_account_links l join public.accounts a on a.id=l.account_id
  where l.connector_id=sebastian and l.closed_at is null and l.phase='Funded'
    and l.external_account_name in ('LFF05092958280006','LFF05092958280007','LFF05092958280008','LFF05092958280009','LFF05092958280010')
    and a.period_id=target_period and a.company_id=lucid_company and a.state='live'
    and l.first_seen_at<'2026-11-12T15:52:27.557747Z'
    and l.accounting_phase is null and l.completed_trade_days is null;
  if coalesce(cardinality(account_ids),0)<>5 or (select count(distinct v) from unnest(account_ids) v)<>5 then raise exception 'DAVID_REPAIR_FUNDED_SCOPE_CHANGED'; end if;
  if (select count(*) from public.purchases where account_id=any(account_ids) and price_cents=8440)<>5
    or exists(select 1 from public.funding_withdrawals where account_id=any(account_ids))
    or (select count(*) from public.operation_entries where account_id=any(account_ids))<>15
    or exists(select 1 from public.operation_entries where account_id=any(account_ids) and phase<>'Evaluacion')
    or exists(select 1 from public.operation_entries where account_id=any(account_ids) group by account_id having sum(case destination when 'NETO BROKER -' then -magnitude_cents when 'NETO BROKER +' then magnitude_cents else 0 end)<>-25998)
  then raise exception 'DAVID_REPAIR_ACCOUNT_HISTORY_CHANGED'; end if;

  -- Independently reported cash and realized PnL prove the broker results.
  if not exists(select 1 from public.ninja_inventory_snapshots s cross join lateral jsonb_array_elements(s.accounts) a
    where s.connector_id=broker and s.observed_at='2026-11-12T14:34:53.784986Z' and a->>'accountName'='2149906'
      and (a->>'cashValue')::numeric=9307.36 and (a->>'realizedProfitLoss')::numeric=959.10)
    or not exists(select 1 from public.ninja_inventory_snapshots s cross join lateral jsonb_array_elements(s.accounts) a
    where s.connector_id=broker and s.observed_at='2026-11-12T15:57:02.572347Z' and a->>'accountName'='2149906'
      and (a->>'cashValue')::numeric=6882.16 and (a->>'realizedProfitLoss')::numeric=-1466.10)
    or not exists(select 1 from public.ninja_inventory_snapshots s cross join lateral jsonb_array_elements(s.accounts) a
    where s.connector_id=broker and s.observed_at='2026-11-13T17:08:19.690437Z' and a->>'accountName'='2149906'
      and (a->>'cashValue')::numeric=6640.86 and (a->>'realizedProfitLoss')::numeric=-241.30)
    or not exists(select 1 from public.ninja_inventory_snapshots s cross join lateral jsonb_array_elements(s.accounts) a
    where s.connector_id=broker and s.observed_at='2026-11-13T18:12:18.397429Z' and a->>'accountName'='2149906'
      and (a->>'cashValue')::numeric=6220.06 and (a->>'realizedProfitLoss')::numeric=-662.10)
  then raise exception 'DAVID_REPAIR_BROKER_EVIDENCE_CHANGED'; end if;
  if (select count(distinct a->>'accountName') from public.ninja_inventory_snapshots s cross join lateral jsonb_array_elements(s.accounts) a
      where s.connector_id=sebastian and s.observed_at='2026-11-12T15:57:02.572347Z'
        and a->>'accountName' in ('LFF05092958280006','LFF05092958280007','LFF05092958280008','LFF05092958280009','LFF05092958280010')
        and (a->>'cashValue')::numeric=53193 and (a->>'realizedProfitLoss')::numeric=3193)<>5
    or (select count(distinct a->>'accountName') from public.ninja_inventory_snapshots s cross join lateral jsonb_array_elements(s.accounts) a
      where s.connector_id=sebastian and s.observed_at='2026-11-13T18:12:18.397429Z'
        and a->>'accountName' in ('LFF05092958280006','LFF05092958280007','LFF05092958280008','LFF05092958280009','LFF05092958280010')
        and (a->>'cashValue')::numeric=53356 and (a->>'realizedProfitLoss')::numeric=163)<>5
  then raise exception 'DAVID_REPAIR_PROP_EVIDENCE_CHANGED'; end if;

  insert into private_david_gap_20261114.before_rows(table_name,row_key,before_row)
    select 'daily_controls',id::text,to_jsonb(t) from public.daily_controls t where period_id=target_period
    union all select 'daily_control_participants',daily_control_id::text||':'||account_id::text,to_jsonb(t) from public.daily_control_participants t where period_id=target_period
    union all select 'operation_entries',id::text,to_jsonb(t) from public.operation_entries t where period_id=target_period
    union all select 'accounts',id::text,to_jsonb(t) from public.accounts t where id=any(account_ids)
    union all select 'purchases',id::text,to_jsonb(t) from public.purchases t where account_id=any(account_ids)
    union all select 'ninja_account_links',id::text,to_jsonb(t) from public.ninja_account_links t where account_id=any(account_ids)
    union all select 'wallet_movements',id::text,to_jsonb(t) from public.wallet_movements t where period_id=target_period
    union all select 'ninja_broker_balance_events',id::text,to_jsonb(t) from public.ninja_broker_balance_events t where connector_id=broker
    union all select 'nodal_agent_cases',id::text,to_jsonb(t) from public.nodal_agent_cases t where subject_user_id=owner_id and status in ('open','investigating')
      and source_question in(select 'account-baseline:'||v::text from unnest(account_ids) v)
  on conflict do nothing;

  -- Preserve IDs, economic results, account assignments and original receipts.
  -- Free the unique sequence before inserting the two missing operations.
  update public.daily_controls set control_number=control_number+100 where period_id=target_period and control_number>=21;
  update public.daily_controls d set
    control_number=case (b.before_row->>'control_number')::integer when 21 then 22 when 22 then 23 else (b.before_row->>'control_number')::integer+2 end,
    balance_before_cents=(b.before_row->>'balance_before_cents')::bigint-case when (b.before_row->>'control_number')::integer>=23 then 284600 else 242520 end,
    balance_after_cents=(b.before_row->>'balance_after_cents')::bigint-case when (b.before_row->>'control_number')::integer>=23 then 284600 else 242520 end,
    sync_issue_reason=null,updated_by=admin_id,updated_at=now()
  from private_david_gap_20261114.before_rows b
  where b.table_name='daily_controls' and b.row_key=d.id::text and d.period_id=target_period
    and (b.before_row->>'control_number')::integer>=21;

  leader:=account_ids[1];
  for item in select * from (values
    (21,date '2026-11-12',930736::bigint,688216::bigint,-242520::bigint,-48504::bigint,
      '2026-11-12T15:57:02.572347Z'::timestamptz,'inventory-recovery:david:sebastian:2026-11-12-funded'),
    (24,date '2026-11-13',664086::bigint,622006::bigint,-42080::bigint,-8416::bigint,
      '2026-11-13T18:12:18.397429Z'::timestamptz,'inventory-recovery:david:sebastian:2026-11-13-funded')
  ) plan(number,day,before_cash,after_cash,result,per_account,observed_at,source_key)
  loop
    insert into public.daily_controls(period_id,control_number,operated_on,kind,balance_before_cents,balance_after_cents,
      operating_result_cents,company_id,leader_account_id,phase,observations,source,source_event_key,received_balance_cents,
      confirmation_key,created_by,created_at,updated_by,updated_at)
    values(target_period,item.number,item.day,'balance_update',item.before_cash,item.after_cash,item.result,lucid_company,leader,
      'Primera vuelta','Recuperación auditada: cinco Lucid Funded de Sebastian. Inventarios originales y variación independiente de P&L realizado; sin fabricar ejecuciones.',
      'ninjatrader',item.source_key,item.after_cash,gen_random_uuid(),owner_id,item.observed_at,admin_id,now()) returning id into new_control;
    recovered_ids:=array_append(recovered_ids,new_control);
    foreach target_account in array account_ids loop
      insert into public.daily_control_participants(daily_control_id,period_id,account_id,role,allocated_result_cents)
      values(new_control,target_period,target_account,case when target_account=leader then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,item.per_account);
      insert into public.operation_entries(daily_control_id,period_id,account_id,operated_on,phase,participant_role,destination,magnitude_cents,created_by,created_at)
      values(new_control,target_period,target_account,item.day,'Primera vuelta',case when target_account=leader then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,
        'NETO BROKER -',abs(item.per_account),owner_id,item.observed_at);
    end loop;
  end loop;
  -- Zero is the Funded baseline, not the two newly recorded trade days.
  update public.ninja_account_links set accounting_phase='Primera vuelta',completed_trade_days=0
    where connector_id=sebastian and account_id=any(account_ids) and phase='Funded' and closed_at is null;
  foreach target_account in array account_ids loop
    perform public.recalculate_nodal_account_state(target_account);
  end loop;
  update public.nodal_agent_cases set status='resolved',reviewed_by=admin_id,reviewed_at=now(),updated_at=now(),
    resolution_note='Dos operaciones Funded de Sebastian recuperadas; base Primera vuelta sin días previos y dos días efectivamente registrados. Desfase broker resuelto con evidencia original.'
    where subject_user_id=owner_id and status in ('open','investigating')
      and source_question in(select 'account-baseline:'||v::text from unnest(account_ids) v);

  if (select count(*) from public.daily_controls where period_id=target_period)<>28
    or not exists(select 1 from public.daily_controls where period_id=target_period and control_number=28 and balance_after_cents=622866 and received_balance_cents=622866)
    or exists(select 1 from (select control_number,balance_before_cents,lag(balance_after_cents) over(order by control_number) prior_balance from public.daily_controls where period_id=target_period) c where control_number>1 and balance_before_cents is distinct from prior_balance)
    or exists(select 1 from public.daily_controls where period_id=target_period and control_number>=21 and balance_after_cents is distinct from received_balance_cents)
    or (select count(*) from public.operation_entries where daily_control_id=any(recovered_ids))<>10
    or exists(select 1 from public.daily_control_participants where daily_control_id=any(recovered_ids) group by daily_control_id having count(*)<>5)
    or exists(select 1 from public.daily_controls c where c.id=any(recovered_ids) and c.operating_result_cents<>(select sum(p.allocated_result_cents) from public.daily_control_participants p where p.daily_control_id=c.id))
    or exists(select 1 from public.accounts where id=any(account_ids) and state<>'live')
    or exists(select 1 from public.operation_entries where account_id=any(account_ids) and phase='Primera vuelta'
      group by account_id having count(*)<>2 or sum(magnitude_cents)<>56920)
    or exists(select 1 from private_david_gap_20261114.before_rows b join public.purchases p on p.id::text=b.row_key where b.table_name='purchases' and b.before_row<>to_jsonb(p))
    or exists(select 1 from private_david_gap_20261114.before_rows b join public.daily_controls d on d.id::text=b.row_key where b.table_name='daily_controls'
      and (b.before_row->>'operating_result_cents')::bigint is distinct from d.operating_result_cents)
  then raise exception 'DAVID_REPAIR_FINAL_INVARIANT_FAILED'; end if;

  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,previous_data,current_data,reason)
  values(admin_id,'periods',target_period,'david_sebastian_funded_gap_repaired_20261114',
    jsonb_build_object('last_control',26,'accounting_cash',907466,'received_cash',622866,'gap',284600),
    jsonb_build_object('last_control',28,'accounting_cash',622866,'received_cash',622866,'gap',0,
      'recovered_controls',to_jsonb(recovered_ids),'results',jsonb_build_array(-242520,-42080),
      'per_account_results',jsonb_build_array(-48504,-8416),'accounts',to_jsonb(account_ids),
      'phase','Primera vuelta','completed_trade_days',2,'funded_baseline_days',0,
      'source','Original broker/prop inventory and independent realized P&L','backup','private_david_gap_20261114.before_rows'),
    'Dos operaciones Funded de Sebastian omitidas: se reconstruye la cadena completa sin registrar retiros, depósitos, compras ni payouts.');
end $repair$;
set constraints all immediate;
commit;
