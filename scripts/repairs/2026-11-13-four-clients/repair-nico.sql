begin;
set local lock_timeout='5s';
do $repair$
declare target_period uuid:='a6693d43-ffba-471e-9321-dddddd0f73c0'; owner_id uuid:='07e71363-9aeb-424b-aa91-0b20c16361f6'; admin_id uuid:='f2f5f816-ec4f-46e1-b216-5267aeadc635'; company uuid:='31f7ac9f-21c4-4322-b188-a6af31d882bd'; new_control uuid; leader uuid; account_ids uuid[]; target_account uuid;
begin
if exists(select 1 from audit_events where entity_id=target_period and action='client_review_20261113_nico_stefano_recovered') then return; end if;
if (select max(control_number) from daily_controls where period_id=target_period)<>3 or not exists(select 1 from daily_controls where period_id=target_period and control_number=3 and balance_after_cents=1299472) then raise exception 'Nico baseline changed'; end if;
select array_agg(l.account_id order by l.external_account_name) into account_ids from ninja_account_links l join accounts a on a.id=l.account_id where l.connector_id='b596c658-a644-4f40-9951-42015980654c' and l.external_account_name in ('LFE05098807990001','LFE05098807990002','LFE05098807990003','LFE05098807990004','LFE05098807990005') and l.closed_at is null and a.period_id=target_period;
if coalesce(cardinality(account_ids),0)<>5 or exists(select 1 from operation_entries where account_id=any(account_ids)) then raise exception 'Nico accounts changed or already operated'; end if;
-- Paired original inventory proves one round trip: broker 12994.72/554.10 ->
-- 13304.82/864.20 realized; all five props 50000/0 -> 48803/-1197.
if not exists(select 1 from ninja_inventory_snapshots s cross join lateral jsonb_array_elements(s.accounts)a where s.connector_id='50553cf1-b40c-4277-9896-0080fea578c9' and s.observed_at='2026-11-09T18:30:41.677052Z' and a->>'accountName'='2043987' and (a->>'cashValue')::numeric=13304.82 and (a->>'realizedProfitLoss')::numeric=864.2) then raise exception 'Nico broker evidence missing'; end if;
if (select count(*) from ninja_inventory_snapshots s cross join lateral jsonb_array_elements(s.accounts)a where s.connector_id='b596c658-a644-4f40-9951-42015980654c' and s.observed_at='2026-11-09T18:30:41.677052Z' and a->>'accountName' like 'LFE0509880799000_' and (a->>'cashValue')::numeric=48803 and (a->>'realizedProfitLoss')::numeric=-1197)<>5 then raise exception 'Nico prop evidence missing'; end if;
insert into private_client_review_20261113.before_rows(table_name,row_key,before_row)
select 'daily_controls',id::text,to_jsonb(t) from daily_controls t where period_id=target_period
union all select 'accounts',id::text,to_jsonb(t) from accounts t where period_id=target_period
union all select 'ninja_account_links',id::text,to_jsonb(t) from ninja_account_links t where account_id=any(account_ids)
union all select 'purchases',id::text,to_jsonb(t) from purchases t where period_id=target_period
on conflict do nothing;
leader:=account_ids[1];
insert into daily_controls(period_id,control_number,operated_on,kind,balance_before_cents,balance_after_cents,operating_result_cents,company_id,leader_account_id,phase,observations,source,source_event_key,received_balance_cents,confirmation_key,created_by,updated_by)
values(target_period,4,'2026-11-09','balance_update',1299472,1330482,31010,company,leader,'Evaluacion','Recuperación auditada desde inventarios originales y P&L realizado: identidad Stefano, cinco cuentas LFE05098807990001–005, apertura observada 18:22:57 UTC y cierre observado 18:30:41 UTC. Las ejecuciones no llegaron; no se inventa telemetría original.','ninjatrader','inventory-recovery:nico:2026-11-09T18:30:41Z',1330482,gen_random_uuid(),owner_id,admin_id) returning id into new_control;
foreach target_account in array account_ids loop
insert into daily_control_participants(daily_control_id,period_id,account_id,role,allocated_result_cents) values(new_control,target_period,target_account,case when target_account=leader then 'leader'::daily_control_participant_role else 'replica'::daily_control_participant_role end,6202);
insert into operation_entries(daily_control_id,period_id,account_id,operated_on,phase,participant_role,destination,magnitude_cents,created_by) values(new_control,target_period,target_account,'2026-11-09','Evaluacion',case when target_account=leader then 'leader'::daily_control_participant_role else 'replica'::daily_control_participant_role end,'NETO BROKER +',6202,owner_id);
perform public.recalculate_nodal_account_state(target_account);
end loop;
if (select sum(allocated_result_cents) from daily_control_participants where daily_control_id=new_control)<>31010 or (select count(*) from operation_entries where daily_control_id=new_control)<>5 then raise exception 'Nico allocation mismatch'; end if;
insert into audit_events(actor_user_id,entity_table,entity_id,action,previous_data,current_data,reason) values(admin_id,'periods',target_period,'client_review_20261113_nico_stefano_recovered',jsonb_build_object('last_control',3,'broker',1299472),jsonb_build_object('control',new_control,'result',31010,'broker',1330482,'accounts',to_jsonb(account_ids),'per_account',6202,'source','original inventory snapshots plus realized P&L','backup','private_client_review_20261113.before_rows'),'Registro omitido; sin alterar compras ni inventar eventos originales.');
end $repair$;
set constraints all immediate;
commit;
select jsonb_build_object('user','Nico','control',c.control_number,'result',c.operating_result_cents,'broker',c.balance_after_cents,'participants',(select count(*) from daily_control_participants p where p.daily_control_id=c.id),'entries',(select count(*) from operation_entries e where e.daily_control_id=c.id)) verification from daily_controls c where period_id='a6693d43-ffba-471e-9321-dddddd0f73c0' and source_event_key='inventory-recovery:nico:2026-11-09T18:30:41Z';


