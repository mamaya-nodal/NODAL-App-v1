-- Authorized reset of Mauricio's OLD ledger/accounts only. Current period is preserved.
-- Run with ROLLBACK for rehearsal; production changes only final terminator to COMMIT.
begin;
create schema if not exists private_mauricio_history_reset_20261116;
revoke all on schema private_mauricio_history_reset_20261116 from public,anon,authenticated;
create table if not exists private_mauricio_history_reset_20261116.before_rows(table_name text,row_hash text,row_data jsonb,captured_at timestamptz default now(),primary key(table_name,row_hash));
alter table private_mauricio_history_reset_20261116.before_rows enable row level security;
revoke all on private_mauricio_history_reset_20261116.before_rows from public,anon,authenticated;
create temp table old_accounts on commit drop as select id from public.accounts where workspace_id='8b1c794b-f0d0-423b-88a0-25b5ec80c0ff' and period_id='46deef83-7f88-4c90-9ef1-84a750166837';
create temp table old_controls on commit drop as select id from public.daily_controls where period_id='46deef83-7f88-4c90-9ef1-84a750166837';
create temp table old_batches on commit drop as select id from public.ninja_operation_batches where daily_control_id in(select id from old_controls) or accounting_period_id='46deef83-7f88-4c90-9ef1-84a750166837' or id in(select batch_id from public.ninja_operation_batch_members where account_id in(select id from old_accounts));
create temp table old_sessions on commit drop as select broker_session_id id from public.ninja_operation_batches where id in(select id from old_batches) union select session_id from public.ninja_operation_batch_members where batch_id in(select id from old_batches);
create temp table current_before on commit drop as select 'accounts' as kind,to_jsonb(t) as data from public.accounts t where period_id='6948ded1-7fa4-44e4-87a3-4013a51ad506' union all select 'controls',to_jsonb(t) from public.daily_controls t where period_id='6948ded1-7fa4-44e4-87a3-4013a51ad506' union all select 'wallet_movements',to_jsonb(t) from public.wallet_movements t where period_id='6948ded1-7fa4-44e4-87a3-4013a51ad506' union all select 'opening',to_jsonb(t) from public.period_opening_snapshots t where period_id='6948ded1-7fa4-44e4-87a3-4013a51ad506';
do $$ declare anchors uuid[]; r record; begin
 perform 1 from public.periods where workspace_id='8b1c794b-f0d0-423b-88a0-25b5ec80c0ff' order by id for update;
 if (select count(*) from old_accounts)<>12 or (select count(*) from old_controls)<>22 then raise exception 'HISTORICAL_SCOPE_CHANGED'; end if;
 if (select count(*) from public.operation_entries where period_id='46deef83-7f88-4c90-9ef1-84a750166837')<>20 then raise exception 'ENTRY_SCOPE_CHANGED'; end if;
 if exists(select 1 from public.ninja_operation_batch_members where batch_id in(select id from old_batches) and account_id is not null and account_id not in(select id from old_accounts)) then raise exception 'BATCH_HAS_OTHER_ACCOUNTS'; end if;
 if exists(select 1 from public.daily_controls where period_id<>'46deef83-7f88-4c90-9ef1-84a750166837' and leader_account_id in(select id from old_accounts)) then raise exception 'CROSS_PERIOD_HISTORY'; end if;
 select array_agg(id) into anchors from(select id from old_accounts union select id from old_controls union select id from old_batches union select '46deef83-7f88-4c90-9ef1-84a750166837'::uuid)t;
 for r in select c.table_name,string_agg(format('t.%I=any($1)',c.column_name),' or ') predicate from information_schema.columns c join information_schema.tables t using(table_catalog,table_schema,table_name) where c.table_schema='public' and t.table_type='BASE TABLE' and c.udt_name='uuid' and c.column_name in('id','period_id','from_period_id','to_period_id','source_period_id','adjustment_period_id','account_id','daily_control_id','accounting_period_id','batch_id') group by c.table_name loop
 execute format('insert into private_mauricio_history_reset_20261116.before_rows(table_name,row_hash,row_data) select %L,md5(to_jsonb(t)::text),to_jsonb(t) from public.%I t where %s on conflict do nothing',r.table_name,r.table_name,r.predicate) using anchors;
 end loop;
 insert into private_mauricio_history_reset_20261116.before_rows select 'ninja_operation_probe_sessions',md5(to_jsonb(s)::text),to_jsonb(s),now() from public.ninja_operation_probe_sessions s where id in(select id from old_sessions) on conflict do nothing;
 insert into private_mauricio_history_reset_20261116.before_rows select 'ninja_broker_balance_events',md5(to_jsonb(e)::text),to_jsonb(e),now() from public.ninja_broker_balance_events e join public.ninja_connectors c on c.id=e.connector_id where c.owner_user_id='f2f5f816-ec4f-46e1-b216-5267aeadc635' and e.observed_at<'2026-11-14T20:10:11Z' on conflict do nothing;
end$$;
-- Keep the original telemetry, but prevent historical sessions/reviews from being offered again.
update public.ninja_operation_probe_sessions set excluded_at=coalesce(excluded_at,now()),excluded_by='f2f5f816-ec4f-46e1-b216-5267aeadc635',exclusion_reason='Historial anterior reiniciado por solicitud expresa del titular' where id in(select id from old_sessions);
update public.ninja_broker_balance_events e set superseded_at=coalesce(superseded_at,now()),superseded_reason='Historial anterior reiniciado por solicitud expresa del titular',status=case when daily_control_id in(select id from old_controls) then 'pending' else e.status end,resolved_at=case when daily_control_id in(select id from old_controls) then null else resolved_at end,daily_control_id=case when daily_control_id in(select id from old_controls) then null else daily_control_id end from public.ninja_connectors c where c.id=e.connector_id and c.owner_user_id='f2f5f816-ec4f-46e1-b216-5267aeadc635' and (e.observed_at<'2026-11-14T20:10:11Z' or e.daily_control_id in(select id from old_controls));
insert into public.ninja_account_registration_exclusions(owner_user_id,connector_id,connection_name,external_account_name,reason,created_by) select 'f2f5f816-ec4f-46e1-b216-5267aeadc635',connector_id,btrim(connection_name),btrim(external_account_name),'Cuenta antigua retirada por solicitud expresa del titular','f2f5f816-ec4f-46e1-b216-5267aeadc635' from public.ninja_account_links where account_id in(select id from old_accounts) on conflict(owner_user_id,connector_id,connection_name,external_account_name) do update set reason=excluded.reason;
-- Temporarily exchange open/closed flags inside this transaction to respect row guards.
update public.periods set lifecycle_status='closed' where id='6948ded1-7fa4-44e4-87a3-4013a51ad506';
update public.periods set lifecycle_status='open' where id='46deef83-7f88-4c90-9ef1-84a750166837';
delete from public.ninja_operation_batches where id in(select id from old_batches);
delete from public.ninja_operation_batch_manual_accounts where account_id in(select id from old_accounts);
delete from public.ninja_operation_batch_members where account_id in(select id from old_accounts);
delete from public.wallet_movements where period_id='46deef83-7f88-4c90-9ef1-84a750166837';
delete from public.funding_withdrawals where period_id='46deef83-7f88-4c90-9ef1-84a750166837';
delete from public.operation_entries where period_id='46deef83-7f88-4c90-9ef1-84a750166837';
delete from public.daily_control_participants where period_id='46deef83-7f88-4c90-9ef1-84a750166837';
delete from public.daily_controls where id in(select id from old_controls);
delete from public.account_phase_withdrawals where account_id in(select id from old_accounts);
delete from public.manual_account_balance_observations where account_id in(select id from old_accounts);
delete from public.account_period_carryovers where account_id in(select id from old_accounts);
delete from public.period_closure_dispatches where period_id='46deef83-7f88-4c90-9ef1-84a750166837';
delete from public.period_closure_approvals where period_id='46deef83-7f88-4c90-9ef1-84a750166837';
delete from public.period_closure_reports where period_id='46deef83-7f88-4c90-9ef1-84a750166837';
delete from public.period_closure_observation_resolutions where period_id='46deef83-7f88-4c90-9ef1-84a750166837';
delete from public.period_rectifications where source_period_id='46deef83-7f88-4c90-9ef1-84a750166837' or adjustment_period_id='46deef83-7f88-4c90-9ef1-84a750166837';
delete from public.period_closure_versions where period_id='46deef83-7f88-4c90-9ef1-84a750166837';
delete from public.rutyx_route_events where account_id in(select id from old_accounts);
delete from public.rutyx_route_states where account_id in(select id from old_accounts);
delete from public.identity_account_assignments where account_id in(select id from old_accounts);
delete from public.ninja_account_links where account_id in(select id from old_accounts);
delete from public.purchases where account_id in(select id from old_accounts);
delete from public.accounts where id in(select id from old_accounts);
update public.periods set lifecycle_status='closed' where id='46deef83-7f88-4c90-9ef1-84a750166837';
update public.periods set lifecycle_status='open' where id='6948ded1-7fa4-44e4-87a3-4013a51ad506';
do $$ declare difference_count integer; begin
 select count(*) into difference_count from(
 (select * from current_before except select 'accounts',to_jsonb(t) from public.accounts t where period_id='6948ded1-7fa4-44e4-87a3-4013a51ad506' except select 'controls',to_jsonb(t) from public.daily_controls t where period_id='6948ded1-7fa4-44e4-87a3-4013a51ad506' except select 'wallet_movements',to_jsonb(t) from public.wallet_movements t where period_id='6948ded1-7fa4-44e4-87a3-4013a51ad506' except select 'opening',to_jsonb(t) from public.period_opening_snapshots t where period_id='6948ded1-7fa4-44e4-87a3-4013a51ad506'))diff;
 if difference_count<>0 then raise exception 'CURRENT_PERIOD_CHANGED'; end if;
end$$;
insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason) values('f2f5f816-ec4f-46e1-b216-5267aeadc635','workspaces','8b1c794b-f0d0-423b-88a0-25b5ec80c0ff','mauricio_history_reset_20261116',jsonb_build_object('backup','private_mauricio_history_reset_20261116','controls',22,'entries',20,'accounts',12,'preserved_period','6948ded1-7fa4-44e4-87a3-4013a51ad506'),'Titular solicita reiniciar operaciones y cuentas antiguas; conserva cinco Lucid actuales y aporte16/11');
select 'Movimientos antiguos restantes' as control,count(*)::text as resultado from public.daily_controls where period_id='46deef83-7f88-4c90-9ef1-84a750166837' union all select 'Cuentas antiguas restantes',count(*)::text from public.accounts where period_id='46deef83-7f88-4c90-9ef1-84a750166837' union all select 'Cuentas actuales conservadas',count(*)::text from public.accounts where period_id='6948ded1-7fa4-44e4-87a3-4013a51ad506' union all select 'Saldo broker actual USD',(balance_after_cents/100.0)::text from public.daily_controls where confirmation_key='7f7c42cd-6cab-4fad-8f41-3330e7b8db44';
rollback;



