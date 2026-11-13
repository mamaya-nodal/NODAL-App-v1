begin;
set local lock_timeout='5s';
create schema if not exists private_client_review_20261113;
revoke all on schema private_client_review_20261113 from public,anon,authenticated;
create table if not exists private_client_review_20261113.before_rows(table_name text,row_key text,before_row jsonb,saved_at timestamptz default now(),primary key(table_name,row_key));
revoke all on private_client_review_20261113.before_rows from public,anon,authenticated;
alter table private_client_review_20261113.before_rows enable row level security;
do $repair$
declare target_period uuid:='f028cd3d-aef3-45b5-a088-fa92e54c70e9';
begin
if exists(select 1 from audit_events where entity_id=target_period and action='client_review_20261113_david_three_trades') then return; end if;
if (select max(control_number) from daily_controls where period_id=target_period)<>23 or not exists(select 1 from daily_controls where period_id=target_period and control_number=23 and balance_after_cents=890830 and received_balance_cents=606230) then raise exception 'David baseline changed'; end if;
insert into private_client_review_20261113.before_rows(table_name,row_key,before_row)
select 'daily_controls',id::text,to_jsonb(t) from daily_controls t where period_id=target_period
union all select 'daily_control_participants',daily_control_id::text||':'||account_id::text,to_jsonb(t) from daily_control_participants t where period_id=target_period
union all select 'operation_entries',id::text,to_jsonb(t) from operation_entries t where period_id=target_period
union all select 'accounts',id::text,to_jsonb(t) from accounts t where period_id=target_period
union all select 'ninja_account_links',id::text,to_jsonb(t) from ninja_account_links t where account_id in(select id from accounts where period_id=target_period)
union all select 'ninja_operation_batches',id::text,to_jsonb(t) from ninja_operation_batches t where connector_id='2f930da1-480c-46e9-a435-b2d5e1c5a2ad'
union all select 'ninja_broker_balance_events',id::text,to_jsonb(t) from ninja_broker_balance_events t where connector_id='2f930da1-480c-46e9-a435-b2d5e1c5a2ad'
on conflict do nothing;
update ninja_operation_batches set accounting_status='shadow_ready',accounting_blocking_reason=null where id in ('d3b413df-618e-4617-9420-1e3dac43fa82','e761ea5b-6765-4975-a7d2-28b0e6c26834','7ee1d6b7-1bb7-4804-830b-27445868257e') and accounting_status='blocked';
perform public.commit_ninja_automatic_operation_batch('d3b413df-618e-4617-9420-1e3dac43fa82');
perform public.commit_ninja_automatic_operation_batch('e761ea5b-6765-4975-a7d2-28b0e6c26834');
perform public.commit_ninja_automatic_operation_batch('7ee1d6b7-1bb7-4804-830b-27445868257e');
perform public.commit_ninja_automatic_operation_batch('d3b413df-618e-4617-9420-1e3dac43fa82');
if not exists(select 1 from daily_controls where period_id=target_period and control_number=26 and balance_after_cents=907466 and received_balance_cents=622866) or (select count(*) from daily_controls where period_id=target_period)<>26 then raise exception 'David repair totals mismatch'; end if;
-- No new cash movement: this opening cash was already the received close of control 23.
update ninja_broker_balance_events set status='superseded' where id='1c15ed7b-a8aa-4aa8-a31c-d59ce09d9ca5' and status='pending' and balance_cents=606230 and exists(select 1 from daily_controls where period_id=target_period and control_number=23 and received_balance_cents=606230);
insert into audit_events(actor_user_id,entity_table,entity_id,action,previous_data,current_data)
values('f2f5f816-ec4f-46e1-b216-5267aeadc635','periods',target_period,'client_review_20261113_david_three_trades',jsonb_build_object('last_control',23,'accounting_cash',890830,'received_cash',606230),jsonb_build_object('controls',jsonb_build_array(24,25,26),'results',jsonb_build_array(8162,-388,8862),'accounting_cash',907466,'received_cash',622866,'unclassified_prior_difference',-284600,'cause','checkpoint selected by save time instead of economic control order','evidence','matching broker/prop sessions and independent original realized P&L','backup','private_client_review_20261113.before_rows'));
end $repair$;
set constraints all immediate;
commit;
select jsonb_build_object('user','David','controls',jsonb_agg(jsonb_build_object('n',c.control_number,'result',c.operating_result_cents,'accounting_cash',c.balance_after_cents,'received_cash',c.received_balance_cents,'participants',(select count(*) from daily_control_participants p where p.daily_control_id=c.id),'entries',(select count(*) from operation_entries e where e.daily_control_id=c.id)) order by c.control_number)) verification from daily_controls c where c.period_id='f028cd3d-aef3-45b5-a088-fa92e54c70e9' and c.control_number>=24;
