-- Scoped cleanup proposal. Run first with ROLLBACK. Commit only after final confirmation.
-- Owner f2f5f816-ec4f-46e1-b216-5267aeadc635; preserve real accounts and access.
begin;
create schema if not exists private_mauricio_sim_cleanup_20261116;
revoke all on schema private_mauricio_sim_cleanup_20261116 from public,anon,authenticated;
create table if not exists private_mauricio_sim_cleanup_20261116.before_rows(table_name text,row_hash text,row_data jsonb,captured_at timestamptz default now(),primary key(table_name,row_hash));
alter table private_mauricio_sim_cleanup_20261116.before_rows enable row level security;
revoke all on private_mauricio_sim_cleanup_20261116.before_rows from public,anon,authenticated;
create temp table cleanup_accounts on commit drop as
select distinct a.id from public.accounts a join public.ninja_account_links l on l.account_id=a.id
where a.workspace_id='8b1c794b-f0d0-423b-88a0-25b5ec80c0ff'
and l.connector_id in('4f72f0d2-c11f-4d26-85f7-4116f656c94a','ce4c4ef6-306f-4042-983f-85dae86b74ae')
and upper(btrim(l.external_account_name)) in('SIM101','SIMPROP1','SIMPROP2','SIMPROP 2')
and lower(btrim(l.connection_name)) in('simulated data feed','trasmision de datos simulados');
create temp table cleanup_controls on commit drop as select id from public.daily_controls
where period_id='6948ded1-7fa4-44e4-87a3-4013a51ad506' and leader_account_id in(select id from cleanup_accounts);
create temp table cleanup_sessions on commit drop as select id from public.ninja_operation_probe_sessions
where connector_id in('4f72f0d2-c11f-4d26-85f7-4116f656c94a','ce4c4ef6-306f-4042-983f-85dae86b74ae')
and upper(btrim(account_name)) in('SIM101','SIMPROP1','SIMPROP2','SIMPROP 2','SIMBROKER','SIMSIMBROKER')
and lower(btrim(connection_name)) in('simulated data feed','trasmision de datos simulados');
do $$ declare r record; anchors uuid[]; begin
 if (select count(*) from cleanup_accounts)<>6 or (select count(*) from cleanup_controls)<>7 then raise exception 'CLEANUP_SCOPE_CHANGED'; end if;
 if exists(select 1 from public.wallet_movements where daily_control_id in(select id from cleanup_controls)) then raise exception 'UNEXPECTED_WALLET_MOVEMENT'; end if;
 if exists(select 1 from public.daily_control_participants where daily_control_id in(select id from cleanup_controls) and account_id not in(select id from cleanup_accounts)) then raise exception 'REAL_PARTICIPANT'; end if;
 select array_agg(id) into anchors from(select id from cleanup_accounts union select id from cleanup_controls union select 'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid union select '8b1c794b-f0d0-423b-88a0-25b5ec80c0ff'::uuid union select '6948ded1-7fa4-44e4-87a3-4013a51ad506'::uuid union select '4f72f0d2-c11f-4d26-85f7-4116f656c94a'::uuid union select 'ce4c4ef6-306f-4042-983f-85dae86b74ae'::uuid)t;
 for r in select c.table_name,string_agg(format('t.%I=any($1)',c.column_name),' or ') predicate from information_schema.columns c join information_schema.tables t using(table_catalog,table_schema,table_name) where c.table_schema='public' and t.table_type='BASE TABLE' and c.table_name in('accounts','purchases','daily_controls','daily_control_participants','operation_entries','ninja_account_links','identity_account_assignments','ninja_operation_batches','ninja_operation_batch_members','ninja_operation_batch_manual_accounts','ninja_operation_probe_sessions','ninja_broker_balance_events','ninja_broker_balance_states','ninja_account_ownership','ninja_unclaimed_broker_accounts','ninja_transition_states','period_opening_snapshots','period_opening_revision_requests') and c.udt_name='uuid' and c.column_name in('id','owner_user_id','user_id','workspace_id','period_id','connector_id','physical_connector_id','identity_id','account_id','daily_control_id','session_id','broker_session_id') group by c.table_name loop
 execute format('insert into private_mauricio_sim_cleanup_20261116.before_rows(table_name,row_hash,row_data) select %L,md5(to_jsonb(t)::text),to_jsonb(t) from public.%I t where %s on conflict do nothing',r.table_name,r.table_name,r.predicate) using anchors;
 end loop;
end$$;
insert into public.ninja_account_registration_exclusions(owner_user_id,connector_id,connection_name,external_account_name,reason,created_by)
select 'f2f5f816-ec4f-46e1-b216-5267aeadc635',connector_id,btrim(connection_name),btrim(external_account_name),'Prueba SIM finalizada','f2f5f816-ec4f-46e1-b216-5267aeadc635' from public.ninja_account_links where account_id in(select id from cleanup_accounts)
on conflict(owner_user_id,connector_id,connection_name,external_account_name) do update set reason=excluded.reason;
update public.ninja_transition_states set state=jsonb_set(state,'{lives}',coalesce((select jsonb_agg(life) from jsonb_array_elements(state->'lives') life where (upper(btrim(life->'tracked'->>'externalAccountName')) in('SIM101','SIMPROP1','SIMPROP2','SIMPROP 2') and lower(btrim(life->>'connectionName')) in('simulated data feed','trasmision de datos simulados')) is not true),'[]'::jsonb)),revision=revision+1,updated_at=now() where connector_id in('4f72f0d2-c11f-4d26-85f7-4116f656c94a','ce4c4ef6-306f-4042-983f-85dae86b74ae');
update public.ninja_broker_balance_events set superseded_at=now(),superseded_reason='Prueba SIM finalizada' where connector_id in('4f72f0d2-c11f-4d26-85f7-4116f656c94a','ce4c4ef6-306f-4042-983f-85dae86b74ae') and exists(select 1 from jsonb_array_elements(source_accounts) a where upper(btrim(a->>'accountName')) in('SIMBROKER','SIMSIMBROKER'));
update public.ninja_broker_balance_states s set balance_cents=b.balance_cents,source_accounts=b.source_accounts,observed_at=b.observed_at,source_event_id=b.source_event_id,updated_at=now() from private_mauricio_sim_20261114.before_rows old cross join lateral jsonb_populate_record(null::public.ninja_broker_balance_states,old.row_data) b where old.table_name='ninja_broker_balance_states' and b.connector_id=s.connector_id and exists(select 1 from jsonb_array_elements(s.source_accounts) a where upper(btrim(a->>'accountName')) in('SIMBROKER','SIMSIMBROKER'));
delete from public.ninja_account_ownership where owner_user_id='f2f5f816-ec4f-46e1-b216-5267aeadc635' and upper(btrim(account_name)) in('SIMBROKER','SIMSIMBROKER') and physical_connector_id in('4f72f0d2-c11f-4d26-85f7-4116f656c94a','ce4c4ef6-306f-4042-983f-85dae86b74ae');
delete from public.ninja_unclaimed_broker_accounts where physical_connector_id in('4f72f0d2-c11f-4d26-85f7-4116f656c94a','ce4c4ef6-306f-4042-983f-85dae86b74ae') and upper(btrim(account_name)) in('SIMBROKER','SIMSIMBROKER');
-- Raw executions, receipts and inventories remain preserved; retire derived sessions.
update public.ninja_operation_probe_sessions set excluded_at=now(),excluded_by='f2f5f816-ec4f-46e1-b216-5267aeadc635',exclusion_reason='Prueba SIM finalizada; limpieza solicitada por Mauricio' where id in(select id from cleanup_sessions);
delete from public.ninja_operation_batches where broker_session_id in(select id from cleanup_sessions);
delete from public.ninja_operation_batch_members where account_id in(select id from cleanup_accounts);
delete from public.operation_entries where daily_control_id in(select id from cleanup_controls);
delete from public.daily_control_participants where daily_control_id in(select id from cleanup_controls);
delete from public.ninja_broker_balance_events where daily_control_id in(select id from cleanup_controls);
delete from public.daily_controls where id in(select id from cleanup_controls);
delete from public.identity_account_assignments where account_id in(select id from cleanup_accounts);
delete from public.ninja_account_links where account_id in(select id from cleanup_accounts);
delete from public.purchases where account_id in(select id from cleanup_accounts);
delete from public.accounts where id in(select id from cleanup_accounts);
-- Restore pre-rehearsal opening; current real accounts stay registered.
update public.period_opening_snapshots set broker_balance_cents=48400,contributed_capital_cents=48400,revision_number=revision_number+1,updated_at=now(),updated_by='f2f5f816-ec4f-46e1-b216-5267aeadc635' where id='d8fef774-3304-422e-94fb-27f065b61684' and broker_balance_cents=19996400;
insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason) values('f2f5f816-ec4f-46e1-b216-5267aeadc635','workspaces','8b1c794b-f0d0-423b-88a0-25b5ec80c0ff','simulation_cleanup_20261116',jsonb_build_object('backup','private_mauricio_sim_cleanup_20261116','accounts',6,'controls',7),'Limpieza SIM solicitada; conserva cuentas reales, identidades, permisos y telemetría original');
rollback;




