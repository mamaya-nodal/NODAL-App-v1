begin;
set local lock_timeout='5s';
do $repair$
declare target_period uuid:='6325a8a9-1ac4-469b-84fa-08e040faf81b'; owner_id uuid:='2b0f63da-bf32-41ee-86c2-98fb5dbe583b'; admin_id uuid:='f2f5f816-ec4f-46e1-b216-5267aeadc635'; company uuid:='218dffdf-163a-4f3e-86ce-82ebf085f6b7'; new_control uuid; leader uuid; selected_account_ids uuid[]; item record; allocated bigint;
begin
if exists(select 1 from audit_events where entity_id=target_period and action='client_review_20261113_lorena_first_recovered') then return; end if;
if (select max(control_number) from daily_controls where period_id=target_period)<>27 or not exists(select 1 from daily_controls where period_id=target_period and control_number=27 and balance_after_cents=748578) then raise exception 'Lorena baseline changed'; end if;
select array_agg(l.account_id order by l.external_account_name) into selected_account_ids from ninja_account_links l join accounts a on a.id=l.account_id where l.connector_id='a697d39d-a2c6-439f-aa8a-fc9075da40e5' and l.external_account_name in ('FTDFYSLX50691920237','FTDFYSLX50531824250','FTDFYSLX50291561923','FTDFYSLX50717536713','FTDFYSLX50755209940') and l.closed_at is null and a.period_id=target_period;
if coalesce(cardinality(selected_account_ids),0)<>5 then raise exception 'Lorena Tradefy group changed'; end if;
if (select count(distinct account_id) from funding_withdrawals where account_id=any(selected_account_ids) and phase='Segunda vuelta' and is_active and created_at<'2026-11-11T14:30Z')<>5 then raise exception 'Lorena third-round payout evidence changed'; end if;
if not exists(select 1 from ninja_inventory_snapshots s cross join lateral jsonb_array_elements(s.accounts)a where s.connector_id='cfefc40f-e916-4469-aae8-47a508ac7a42' and s.observed_at='2026-11-11T14:30:03.488023Z' and a->>'accountName'='2199664' and (a->>'cashValue')::numeric=6944.3 and (a->>'realizedProfitLoss')::numeric=-597.22) then raise exception 'Lorena broker evidence missing'; end if;
insert into private_client_review_20261113.before_rows(table_name,row_key,before_row)
select 'daily_controls',id::text,to_jsonb(t) from daily_controls t where period_id=target_period
union all select 'daily_control_participants',daily_control_id::text||':'||account_id::text,to_jsonb(t) from daily_control_participants t where period_id=target_period
union all select 'operation_entries',id::text,to_jsonb(t) from operation_entries t where period_id=target_period
union all select 'accounts',id::text,to_jsonb(t) from accounts t where period_id=target_period
union all select 'ninja_account_links',id::text,to_jsonb(t) from ninja_account_links t where account_id in(select id from accounts where period_id=target_period)
on conflict do nothing;
leader:=selected_account_ids[1];
insert into daily_controls(period_id,control_number,operated_on,kind,balance_before_cents,balance_after_cents,operating_result_cents,company_id,leader_account_id,phase,observations,source,source_event_key,received_balance_cents,confirmation_key,created_by,updated_by)
values(target_period,28,'2026-11-11','balance_update',748578,694430,-54148,company,leader,'Tercera vuelta','Recuperación auditada desde inventarios originales y P&L realizado: identidad David Malagreca, cinco Tradefy Funded. P&L broker -55,74 a -597,22 y saldo 7.485,78 a 6.944,30. Los payouts de segunda vuelta acreditan la tercera vuelta; no se inventan ejecuciones originales.','ninjatrader','inventory-recovery:lorena:2026-11-11T14:30:03Z',694430,gen_random_uuid(),owner_id,admin_id) returning id into new_control;
for item in select a.id,a.ordinality from unnest(selected_account_ids) with ordinality a(id,ordinality) loop
allocated:=case when item.ordinality<=3 then -10830 else -10829 end;
insert into daily_control_participants(daily_control_id,period_id,account_id,role,allocated_result_cents) values(new_control,target_period,item.id,case when item.id=leader then 'leader'::daily_control_participant_role else 'replica'::daily_control_participant_role end,allocated);
insert into operation_entries(daily_control_id,period_id,account_id,operated_on,phase,participant_role,destination,magnitude_cents,created_by) values(new_control,target_period,item.id,'2026-11-11','Tercera vuelta',case when item.id=leader then 'leader'::daily_control_participant_role else 'replica'::daily_control_participant_role end,'NETO BROKER -',abs(allocated),owner_id);
perform public.recalculate_nodal_account_state(item.id);
end loop;
if (select sum(allocated_result_cents) from daily_control_participants where daily_control_id=new_control)<>-54148 or (select count(*) from operation_entries where daily_control_id=new_control)<>5 then raise exception 'Lorena allocation mismatch'; end if;
insert into audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason) values(admin_id,'periods',target_period,'client_review_20261113_lorena_first_recovered',jsonb_build_object('control',new_control,'result',-54148,'broker',694430,'accounts',to_jsonb(selected_account_ids),'phase','Tercera vuelta','source','original inventory snapshots plus realized P&L','backup','private_client_review_20261113.before_rows'),'Primera operación omitida recuperada cronológicamente. Las siguientes requieren completar o verificar las cuentas faltantes.');
end $repair$;
set constraints all immediate;
commit;
select jsonb_build_object('user','Lorena','control',c.control_number,'result',c.operating_result_cents,'broker',c.balance_after_cents,'phase',c.phase,'participants',(select count(*) from daily_control_participants p where p.daily_control_id=c.id),'entries',(select count(*) from operation_entries e where e.daily_control_id=c.id)) verification from daily_controls c where period_id='6325a8a9-1ac4-469b-84fa-08e040faf81b' and source_event_key='inventory-recovery:lorena:2026-11-11T14:30:03Z';
