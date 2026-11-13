begin;
set local lock_timeout='5s';
do $repair$
declare target_period uuid:='d4d9ef94-f0b9-495b-9961-e3c47c32ddeb';
begin
if exists(select 1 from audit_events where entity_id=target_period and action='client_review_20261113_baltazar_first_trade') then return; end if;
if (select max(control_number) from daily_controls where period_id=target_period)<>30 or not exists(select 1 from daily_controls where period_id=target_period and control_number=30 and balance_after_cents=137908) then raise exception 'Baltazar baseline changed'; end if;
if not exists(select 1 from ninja_operation_probe_sessions where id=3858155 and status='closed' and result=-547.22 and opening_balance=9930.08 and closing_balance=9382.86) then raise exception 'Baltazar first trade changed'; end if;
if (select count(*) from ninja_trade_telemetry_events where connector_id='4d539f74-3b6d-48c9-85a1-3349548db500' and account_name='2234971' and event_type='execution' and occurred_at between '2026-11-13T19:51:04.535Z' and '2026-11-13T19:54:17.572Z')<>3 then raise exception 'Baltazar independent execution evidence changed'; end if;
insert into private_client_review_20261113.before_rows(table_name,row_key,before_row)
select 'daily_controls',id::text,to_jsonb(t) from daily_controls t where period_id=target_period
union all select 'daily_control_participants',daily_control_id::text||':'||account_id::text,to_jsonb(t) from daily_control_participants t where period_id=target_period
union all select 'operation_entries',id::text,to_jsonb(t) from operation_entries t where period_id=target_period
union all select 'accounts',id::text,to_jsonb(t) from accounts t where period_id=target_period
union all select 'ninja_account_links',id::text,to_jsonb(t) from ninja_account_links t where account_id in(select id from accounts where period_id=target_period)
union all select 'ninja_operation_batches',id::text,to_jsonb(t) from ninja_operation_batches t where connector_id='4d539f74-3b6d-48c9-85a1-3349548db500'
union all select 'ninja_operation_probe_sessions',id::text,to_jsonb(t) from ninja_operation_probe_sessions t where id in (3858155,3864180,3865513)
union all select 'ninja_broker_balance_events',id::text,to_jsonb(t) from ninja_broker_balance_events t where connector_id='4d539f74-3b6d-48c9-85a1-3349548db500'
on conflict do nothing;
update ninja_operation_probe_sessions set result_verified=true,result_conflict=false where id=3858155;
update ninja_operation_batches set accounting_status='shadow_ready',accounting_blocking_reason=null where id='cf903c6e-cf9c-4eb9-b318-755737b6ede3' and accounting_status='blocked';
perform public.commit_ninja_automatic_operation_batch('cf903c6e-cf9c-4eb9-b318-755737b6ede3');
perform public.commit_ninja_automatic_operation_batch('cf903c6e-cf9c-4eb9-b318-755737b6ede3');
if not exists(select 1 from daily_controls where period_id=target_period and control_number=31 and balance_after_cents=83186 and received_balance_cents=938286) then raise exception 'Baltazar first trade totals mismatch'; end if;
insert into ninja_broker_balance_events(connector_id,source_event_id,observed_at,balance_cents,source_accounts)
values('4d539f74-3b6d-48c9-85a1-3349548db500','ninja-preoperation:1356951','2026-11-13T19:51:04.535Z',993008,jsonb_build_array(jsonb_build_object('accountName','2234971','connectionName','Live','balanceInCents',993008,'expectedBalanceInCents',137908))) on conflict(connector_id,source_event_id) do nothing;
-- The last round trip was already flat with a final balance; only the ten-second
-- quiet window remained when the last packet was processed. Rebuild metadata,
-- never fabricate original receipts or executions.
update ninja_operation_probe_sessions set status='closed',settled_at=last_event_at+interval '10 seconds',result_verified=true,result_conflict=false,updated_at=now()
where id=3865513 and status='settling' and flat_at is not null and result=2058.52 and closing_balance=10379.9 and last_event_at='2026-11-13T21:35:52.759990Z';
insert into ninja_operation_batches(connector_id,broker_session_id,status,broker_result_cents,opened_at,settled_at,accounting_status,accounting_mode,accounting_blocking_reason,operated_on,context_prop_count,rounding_difference_cents)
select connector_id,id,'unmatched',205852,opened_at,settled_at,'blocked','active','Falta recuperar las cuentas participantes desde los inventarios originales.','2026-11-13',5,205852 from ninja_operation_probe_sessions where id=3865513 and status='closed'
on conflict(connector_id,broker_session_id) do nothing;
insert into ninja_operation_batch_members(batch_id,session_id,role) select id,3865513,'broker' from ninja_operation_batches where broker_session_id=3865513 on conflict do nothing;
insert into audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
values('f2f5f816-ec4f-46e1-b216-5267aeadc635','periods',target_period,'client_review_20261113_baltazar_first_trade',jsonb_build_object('control',31,'result',-54722,'accounts',5,'accounting_cash',83186,'received_cash',938286,'unclassified_prior_increase',855100,'tail_rebuilt',3865513,'backup','private_client_review_20261113.before_rows'),'Resultado independiente verificado con ejecuciones y P&L realizado. Aumento previo de saldo conservado pendiente, sin inventar depósito.');
end $repair$;
set constraints all immediate;
commit;
select jsonb_build_object('user','Baltazar','control',c.control_number,'result',c.operating_result_cents,'accounting_cash',c.balance_after_cents,'received_cash',c.received_balance_cents,'participants',(select count(*) from daily_control_participants p where p.daily_control_id=c.id),'entries',(select count(*) from operation_entries e where e.daily_control_id=c.id)) verification from daily_controls c where period_id='d4d9ef94-f0b9-495b-9961-e3c47c32ddeb' and control_number=31;

