-- These nine technical receipts describe operations already present in the ledger.
begin;
insert into private_legacy_burn_cleanup_20261117.before_rows(table_name,row_id,data)
select 'ninja_broker_balance_events',e.id::text,to_jsonb(e)
from public.ninja_operation_batches b join public.ninja_operation_probe_sessions s on s.id=b.broker_session_id
join public.ninja_broker_balance_events e on e.connector_id=b.connector_id and e.source_event_id='ninja-operation:'||s.opening_event_id
where b.id in(select entity_id from public.audit_events where action='legacy_burn_existing_control_linked_20261117') and b.accounting_status='committed' and b.daily_control_id is not null and e.status='pending' and e.daily_control_id is null on conflict do nothing;
with linked as(
 update public.ninja_broker_balance_events e set status='confirmed',daily_control_id=b.daily_control_id,resolved_at=now()
 from public.ninja_operation_batches b join public.ninja_operation_probe_sessions s on s.id=b.broker_session_id
 where e.connector_id=b.connector_id and e.source_event_id='ninja-operation:'||s.opening_event_id and b.id in(select entity_id from public.audit_events where action='legacy_burn_existing_control_linked_20261117') and b.accounting_status='committed' and b.daily_control_id is not null and e.status='pending' and e.daily_control_id is null
 returning e.id,e.daily_control_id
) insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
select 'f2f5f816-ec4f-46e1-b216-5267aeadc635','ninja_broker_balance_events',id,'legacy_burn_broker_receipt_linked_20261117',jsonb_build_object('daily_control_id',daily_control_id,'financial_entries_added',0),'Recepción técnica asociada a la operación económica existente; no es una nueva transferencia ni un nuevo resultado.' from linked;
select count(*) as recibos_vinculados from public.audit_events where action='legacy_burn_broker_receipt_linked_20261117';
commit;
