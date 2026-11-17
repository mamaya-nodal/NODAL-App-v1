begin;
create schema if not exists private_ale_promotion_20261117;
create table if not exists private_ale_promotion_20261117.before_rows(table_name text,row_id text,data jsonb,primary key(table_name,row_id));
alter table private_ale_promotion_20261117.before_rows enable row level security;
revoke all on schema private_ale_promotion_20261117 from public,anon,authenticated;
revoke all on all tables in schema private_ale_promotion_20261117 from public,anon,authenticated;
do $$
declare c uuid:='00ed1da0-6408-43e0-bd44-ba9204175b95'; owner_id uuid:='fb1184da-8f37-4d85-abf1-46e2fb352fef'; r record; old_link ninja_account_links%rowtype; funded_life text; before_state jsonb;
begin
 perform 1 from ninja_transition_states where connector_id=c for update;
 if exists(select 1 from audit_events where action='ale_false_burn_promotion_20261117' and entity_id=c) then return; end if;
 insert into private_ale_promotion_20261117.before_rows
 select 'transition_state',connector_id::text,to_jsonb(s) from ninja_transition_states s where connector_id=c
 union all select 'links',id::text,to_jsonb(l) from ninja_account_links l where connector_id=c
 union all select 'changes',id::text,to_jsonb(e) from ninja_account_change_events e where connector_id=c
 union all select 'accounts',a.id::text,to_jsonb(a) from accounts a join ninja_account_links l on l.account_id=a.id where l.connector_id=c
 union all select 'purchases',p.id::text,to_jsonb(p) from purchases p join ninja_account_links l on l.account_id=p.account_id where l.connector_id=c
 on conflict do nothing;
 for r in select * from (values(31,11),(32,12),(33,13),(34,14),(35,15)) m(old_number,new_number) loop
  select * into strict old_link from ninja_account_links where connector_id=c and external_account_name='LFE0509653361'||lpad(r.old_number::text,4,'0') and closure_reason='burned' for update;
  select l->>'lifeId' into strict funded_life from ninja_transition_states s cross join lateral jsonb_array_elements(s.state->'lives')l where s.connector_id=c and l->'tracked'->>'externalAccountName'='LFF0509653361'||lpad(r.new_number::text,4,'0');
  if exists(select 1 from ninja_account_links where connector_id=c and external_account_name='LFF0509653361'||lpad(r.new_number::text,4,'0')) then raise exception 'Funded account already registered; review before repair'; end if;
  if not exists(select 1 from ninja_operation_probe_sessions where connector_id=c and account_name=old_link.external_account_name and closing_balance=53009 and opened_at::date='2026-11-16') then raise exception 'Evaluation approval evidence missing'; end if;
  update ninja_account_change_events set resolution_status='dismissed',reason=reason||' Corrección auditada: mínimo13/11 comparado incorrectamente con piso EOD posterior; promoción confirmada por Mauricio.' where connector_id=c and from_account_name=old_link.external_account_name and event_type='burned' and source_event_id like 'ninja-operation-burn:%';
  update accounts set state='live',state_origin='automatic',updated_at=now() where id=old_link.account_id;
  update ninja_account_links set closed_at=null,closure_reason=null where id=old_link.id;
  insert into ninja_account_change_events(connector_id,connection_name,event_type,from_account_name,to_account_name,from_life_id,to_life_id,occurred_at,source_event_id,automatic,resolution_status,reason)
  values(c,'LUCID ALEJANDRO','evaluation_to_funded',old_link.external_account_name,'LFF0509653361'||lpad(r.new_number::text,4,'0'),old_link.life_id,funded_life,'2026-11-16T15:34:58.609208Z','ale-promotion-repair-20261117:'||r.old_number,true,'automatic','Promoción recuperada: correspondencia individual confirmada por Mauricio; se conserva cuenta, compra e historial.');
  if not exists(select 1 from ninja_account_links where account_id=old_link.account_id and phase='Funded' and closed_at='2026-11-17T15:40:25.785639Z') then raise exception 'Promotion link was not applied'; end if;
  update ninja_account_links set accounting_phase='Primera vuelta',completed_trade_days=0 where account_id=old_link.account_id and phase='Funded';
  update ninja_account_change_events set resolution_status='dismissed',reason=reason||' Reemplazado por promoción recuperada con compra original.' where connector_id=c and to_account_name='LFF0509653361'||lpad(r.new_number::text,4,'0') and event_type='new_account' and resolution_status='pending';
 end loop;
 select state into before_state from ninja_transition_states where connector_id=c;
 update ninja_transition_states set state=jsonb_set(state,'{lives}',(select jsonb_agg(l) from jsonb_array_elements(before_state->'lives')l where l->'tracked'->>'externalAccountName' not in('LFE05096533610031','LFE05096533610032','LFE05096533610033','LFE05096533610034','LFE05096533610035'))),revision=revision+1 where connector_id=c;
 insert into audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason) values(owner_id,'ninja_transition_states',c,'ale_false_burn_promotion_20261117',jsonb_build_object('backup','private_ale_promotion_20261117.before_rows','mapping','031->011,032->012,033->013,034->014,035->015','purchases_preserved',true),'False retrospective EOD burn repaired; mapping explicitly confirmed by Mauricio. Original telemetry unchanged.');
end$$;
update public.ninja_telemetry_rebuild_jobs set revision=revision+1,replay_since='2026-11-13T18:00:00Z',replay_pending_since='2026-11-13T18:00:00Z',next_attempt_at=now(),updated_at=now() where connector_id='00ed1da0-6408-43e0-bd44-ba9204175b95';
select l.external_account_name,l.account_id,l.phase,l.closed_at,a.state,p.price_cents from public.ninja_account_links l join public.accounts a on a.id=l.account_id join public.purchases p on p.account_id=a.id where l.connector_id='00ed1da0-6408-43e0-bd44-ba9204175b95' and l.external_account_name in('LFF05096533610011','LFF05096533610012','LFF05096533610013','LFF05096533610014','LFF05096533610015') order by 1;
rollback;
