begin;
set constraints all deferred;
create schema if not exists private_franco_chain_20261116;
create table if not exists private_franco_chain_20261116.before_rows(table_name text,row_id text,data jsonb,primary key(table_name,row_id));
alter table private_franco_chain_20261116.before_rows enable row level security;
revoke all on schema private_franco_chain_20261116 from public,anon,authenticated;
revoke all on all tables in schema private_franco_chain_20261116 from public,anon,authenticated;
do $repair$
declare p uuid:='e6869570-7e74-4a57-927e-40d7261e54ac'; owner_id uuid:='ca3dca6d-7ff2-4f92-957d-f3cb2c7553bf'; c uuid:='038a26a3-d9e8-44cf-91f9-ddc9054beff5'; ed uuid:='edadd4fa-57b7-465d-8ae9-81359d56e61d'; item record; a record; ids uuid[]; leader uuid; company uuid; phase_value public.operation_phase; new_id uuid; cash bigint:=611335; amount bigint; source_key text; recovered uuid[]:='{}'; entry_count integer;
begin
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform 1 from periods where id=p and lifecycle_status='open' for update;
 if not found then raise exception 'Period not open'; end if;
 if exists(select 1 from audit_events where action='franco_complete_chain_20261116' and entity_id=p) then return; end if;
 if (select max(control_number) from daily_controls where period_id=p)<>24 or not exists(select 1 from daily_controls where id='98a2d904-25af-4ff8-adea-ecc8c99cbb81' and period_id=p and control_number=24 and operating_result_cents=-29750) then raise exception 'Ledger changed; refresh plan'; end if;
 insert into private_franco_chain_20261116.before_rows
 select 'controls',id::text,to_jsonb(t) from daily_controls t where period_id=p
 union all select 'participants',daily_control_id::text||':'||account_id,to_jsonb(t) from daily_control_participants t where period_id=p
 union all select 'entries',id::text,to_jsonb(t) from operation_entries t where period_id=p
 union all select 'accounts',id::text,to_jsonb(t) from accounts t where period_id=p
 union all select 'purchases',id::text,to_jsonb(t) from purchases t where period_id=p
 union all select 'links',id::text,to_jsonb(t) from ninja_account_links t where connector_id in(c,ed)
 union all select 'batches',id::text,to_jsonb(t) from ninja_operation_batches t where connector_id in(c,ed)
 union all select 'members',batch_id::text||':'||session_id,to_jsonb(t) from ninja_operation_batch_members t where batch_id in(select id from ninja_operation_batches where connector_id in(c,ed))
 union all select 'balance_events',id::text,to_jsonb(t) from ninja_broker_balance_events t where connector_id=c
 on conflict do nothing;
 update daily_controls set control_number=36 where id='98a2d904-25af-4ff8-adea-ecc8c99cbb81';
 for item in select * from (values
 (24,'2026-11-06T17:36:44.844086Z',-56574::bigint,554761::bigint,null::uuid,'old','Evaluacion'),
 (25,'2026-11-09T16:41:45.173367Z',130852,685613,null,'old','Evaluacion'),
 (26,'2026-11-12T15:43:32.944521Z',-51574,634039,null,'new','Evaluacion'),
 (27,'2026-11-12T17:04:14.015924Z',-16074,617965,'8d193b0e-affc-44cc-a87e-6da87d048912',null,null),
 (28,'2026-11-12T17:14:48.514459Z',52926,670891,'ea22fae1-9c80-49dd-9969-d22c408b57e8',null,null),
 (29,'2026-11-12T17:26:28.214788Z',15426,686317,'522d9ed1-cdac-432a-a5ae-48b3b50f1f32',null,null),
 (30,'2026-11-12T17:58:46.786652Z',65926,752243,'9511581f-f7a1-4a74-bfef-253e8f3bb26d',null,null),
 (31,'2026-11-12T18:34:11.999860Z',-53574,698669,'cc5293af-3502-4d01-91bf-d31df04161a3',null,null),
 (32,'2026-11-13T15:32:42.174667Z',-105648,593021,'250e1499-ce69-4523-a8ff-de116f2820c8',null,null),
 (33,'2026-11-13T16:37:25.205978Z',164842,757863,'a8c508f2-c367-4d7e-8fae-e3f0a5b5b4ce',null,null),
 (34,'2026-11-13T18:02:28.844481Z',-109148,648715,null,'new','Evaluacion'),
 (35,'2026-11-13T18:29:32.684276Z',-32050,616665,null,'new','Primera vuelta')
 )v(number,observed_at,result_cents,after_cash,batch_id,account_group,phase_name) loop
  if cash+item.result_cents<>item.after_cash then raise exception 'Cash evidence does not reconcile at %',item.number; end if;
  if item.batch_id is not null then
   if not exists(select 1 from ninja_operation_batches where id=item.batch_id and broker_result_cents=item.result_cents and daily_control_id is null) then raise exception 'Batch changed'; end if;
   select array_agg(m.account_id order by s.account_name) into ids from ninja_operation_batch_members m join ninja_operation_probe_sessions s on s.id=m.session_id where m.batch_id=item.batch_id and m.role='prop';
   if array_length(ids,1)<>(case when item.batch_id='a8c508f2-c367-4d7e-8fae-e3f0a5b5b4ce'::uuid then 4 else 5 end) then raise exception 'Unexpected batch account count'; end if;
   select case when s.account_name like 'LFE%' then 'Evaluacion'::public.operation_phase else coalesce(l.accounting_phase,'Primera vuelta'::public.operation_phase) end into phase_value from ninja_operation_batch_members m join ninja_operation_probe_sessions s on s.id=m.session_id join ninja_account_links l on l.account_id=m.account_id and l.external_account_name=s.account_name where m.batch_id=item.batch_id and m.role='prop' limit 1;
   select 'ninja-operation:'||s.opening_event_id into source_key from ninja_operation_batches b join ninja_operation_probe_sessions s on s.id=b.broker_session_id where b.id=item.batch_id;
  else
   select array_agg(distinct l.account_id order by l.account_id) into ids from ninja_account_links l where l.connector_id=ed and ((item.account_group='old' and l.external_account_name in('LFE05098493670001','LFE05098493670002','LFE05098493670003','LFE05098493670004','LFE05098493670005')) or (item.account_group='new' and l.external_account_name in('LFE05098493670006','LFE05098493670007','LFE05098493670008','LFE05098493670009','LFE05098493670010')));
   if array_length(ids,1)<>5 then raise exception 'Identity accounts ambiguous'; end if;
   phase_value:=item.phase_name::public.operation_phase;
   source_key:='inventory-recovery:franco-edgardo:'||item.number;
  end if;
  leader:=ids[1]; select company_id into company from accounts where id=leader;
  if exists(select 1 from daily_controls where period_id=p and source_event_key=source_key) then raise exception 'Duplicate source'; end if;
  insert into daily_controls(period_id,control_number,operated_on,kind,balance_before_cents,balance_after_cents,operating_result_cents,company_id,leader_account_id,phase,observations,source,source_event_key,received_balance_cents,confirmation_key,created_by,created_at,updated_by,updated_at)
  values(p,item.number,(item.observed_at::timestamptz at time zone 'America/Argentina/Buenos_Aires')::date,'balance_update',cash,item.after_cash,item.result_cents,company,leader,phase_value,'Recuperación auditada desde inventarios broker/props y P&L independientes; sin crear ejecuciones ficticias.','ninjatrader',source_key,item.after_cash,gen_random_uuid(),owner_id,item.observed_at::timestamptz,owner_id,now()) returning id into new_id;
  recovered:=array_append(recovered,new_id);
  foreach leader in array ids loop
   amount:=sign(item.result_cents)*round(abs(item.result_cents)::numeric/5);
   if item.batch_id is not null then select allocated_broker_result_cents into amount from ninja_operation_batch_members where batch_id=item.batch_id and account_id=leader and role='prop'; end if;
   insert into daily_control_participants(daily_control_id,period_id,account_id,role,allocated_result_cents) values(new_id,p,leader,case when leader=ids[1] then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,amount);
   insert into operation_entries(daily_control_id,period_id,account_id,operated_on,phase,participant_role,destination,magnitude_cents,created_by,created_at)
   values(new_id,p,leader,(item.observed_at::timestamptz at time zone 'America/Argentina/Buenos_Aires')::date,phase_value,case when leader=ids[1] then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,case when amount<0 then 'NETO BROKER -'::public.broker_result_destination else 'NETO BROKER +'::public.broker_result_destination end,abs(amount),owner_id,item.observed_at::timestamptz);
  end loop;
  if item.batch_id is not null then
   update ninja_operation_batches set accounting_mode='active',accounting_status='committed',accounting_blocking_reason=null,accounting_period_id=p,accounting_company_id=company,accounting_phase=phase_value,daily_control_id=new_id,updated_at=now() where id=item.batch_id;
   update ninja_broker_balance_events e set status='confirmed',daily_control_id=new_id,resolved_at=now() where e.connector_id=c and e.source_event_id=source_key and e.status='pending';
  end if;
  cash:=item.after_cash;
 end loop;
 if cash<>616665 then raise exception 'Unexpected pre-Funded balance'; end if;
 update daily_controls set balance_before_cents=616665,balance_after_cents=586915,sync_issue_reason=null,updated_at=now(),updated_by=owner_id where id='98a2d904-25af-4ff8-adea-ecc8c99cbb81';
 update ninja_broker_balance_events set status='confirmed',daily_control_id=(select id from daily_controls where period_id=p and control_number=27),resolved_at=now() where id='adbfac40-7455-4532-973f-d127f62e37e9' and status='pending';
 update ninja_account_links set accounting_phase='Primera vuelta',completed_trade_days=0 where connector_id=ed and phase='Funded' and closed_at is null;
 if exists(select 1 from(select control_number,balance_before_cents,lag(balance_after_cents) over(order by control_number) prior from daily_controls where period_id=p)t where control_number>=24 and balance_before_cents<>prior) then raise exception 'Broken control chain'; end if;
 if (select count(*) from operation_entries where daily_control_id=any(recovered))<>59 then raise exception 'Expected fifty-nine entries'; end if;
 insert into audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason) values(owner_id,'periods',p,'franco_complete_chain_20261116',jsonb_build_object('backup','private_franco_chain_20261116.before_rows','controls',recovered,'balance_cents',586915,'recovered_operations',12),'Five identity inventory-backed operations and seven titular batches recovered chronologically. Original purchases, payouts, telemetry and executed results preserved.');
end $repair$;
set constraints all immediate;
commit;



