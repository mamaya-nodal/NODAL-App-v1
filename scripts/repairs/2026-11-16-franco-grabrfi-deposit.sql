begin;
do $$
declare p uuid:='e6869570-7e74-4a57-927e-40d7261e54ac'; owner_id uuid:='ca3dca6d-7ff2-4f92-957d-f3cb2c7553bf'; movement_id uuid; control_id uuid; event_id uuid;
begin
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform 1 from periods where id=p for update;
 if exists(select 1 from audit_events where entity_id=p and action='franco_grabrfi_4975_20261116') then return; end if;
 if not exists(select 1 from daily_controls where period_id=p and control_number=36 and balance_after_cents=586915) or (select max(control_number) from daily_controls where period_id=p)<>36 then raise exception 'Refresh deposit baseline'; end if;
 if not exists(select 1 from ninja_inventory_snapshots s cross join lateral jsonb_array_elements(s.accounts)a where s.connector_id='038a26a3-d9e8-44cf-91f9-ddc9054beff5' and s.observed_at='2026-11-16T15:57:37.503317Z' and a->>'accountName'='2196146' and (a->>'cashValue')::numeric=10844.15) then raise exception 'Deposit evidence missing'; end if;
 insert into private_franco_chain_20261116.before_rows select 'wallet_movements',id::text,to_jsonb(m) from wallet_movements m where period_id=p on conflict do nothing;
 perform record_ninja_broker_balance_difference('038a26a3-d9e8-44cf-91f9-ddc9054beff5','ninja-preoperation:franco-deposit-evidence-20261116','2196146','En Vivo',1084415,586915,'2026-11-16T15:57:37.503317Z','2026-11-16T14:07:01.173508Z');
 movement_id:=reconcile_nodal_wallet_broker_transfer(p,'d362a5f6-625c-418c-9d54-ed8cd256b518','2026-11-16','wallet_to_broker',1084415,0,'Mauricio confirmó ingreso4975USD desdeGrabrFi16/11. Inventarios originales5869.15->10844.15. No esganancia ni aporteexterno; comisiónadicional noinformada.');
 select daily_control_id into strict control_id from wallet_movements where id=movement_id;
 update daily_controls set received_balance_cents=1084415,sync_issue_reason=null where id=control_id;
 update ninja_broker_balance_events set status='confirmed',daily_control_id=control_id,resolved_at=now() where connector_id='038a26a3-d9e8-44cf-91f9-ddc9054beff5' and source_event_id='ninja-preoperation:franco-deposit-evidence-20261116' returning id into event_id;
 if (select balance_after_cents from daily_controls where id=control_id)<>1084415 then raise exception 'Deposit result mismatch'; end if;
 insert into audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason) values(owner_id,'periods',p,'franco_grabrfi_4975_20261116',jsonb_build_object('wallet_id','d362a5f6-625c-418c-9d54-ed8cd256b518','movement',movement_id,'control',control_id,'event',event_id,'amount_cents',497500,'wallet_before_cents',672669,'broker_before',586915,'broker_after',1084415),'Transfer source/date confirmed by Mauricio; original Ninja inventory confirms exact4975 increase. Applied existing wallet-to-broker function, preserving audit and sufficient-balance validation.');
end$$;
commit;
