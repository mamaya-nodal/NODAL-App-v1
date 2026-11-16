-- Mauricio explicitly requested external funding into the existing wallet, then broker.
-- Rehearse with ROLLBACK; authorized production execution replaces only final terminator.
begin;
select set_config('request.jwt.claim.sub','f2f5f816-ec4f-46e1-b216-5267aeadc635',true);
do $$ declare event public.ninja_broker_balance_events%rowtype; control_id uuid; contribution_id uuid; transfer_id uuid; before_wallet bigint; after_wallet bigint;
begin
 perform 1 from public.periods where id='6948ded1-7fa4-44e4-87a3-4013a51ad506' and workspace_id='8b1c794b-f0d0-423b-88a0-25b5ec80c0ff' and lifecycle_status='open' for update;
 if not found then raise exception 'PERIOD_CHANGED'; end if;
 select e.* into event from public.ninja_broker_balance_events e join public.ninja_connectors c on c.id=e.connector_id where e.id='eae53f74-6224-49c6-bd8d-01fa92062ac3' and c.owner_user_id=auth.uid() for update of e;
 if not found or event.status<>'pending' or event.superseded_at is not null or event.daily_control_id is not null or event.balance_cents<>1195900 or (event.source_accounts->0->>'expectedBalanceInCents')::bigint<>48400 then raise exception 'EVENT_CHANGED'; end if;
 if exists(select 1 from public.daily_controls where period_id='6948ded1-7fa4-44e4-87a3-4013a51ad506') then raise exception 'CONTROLS_CHANGED'; end if;
 if public.nodal_opening_broker_balance('6948ded1-7fa4-44e4-87a3-4013a51ad506')<>48400 then raise exception 'OPENING_CHANGED'; end if;
 perform 1 from public.nodal_wallets where id='6debf2ca-e899-430b-a07b-51830f7cda10' and workspace_id='8b1c794b-f0d0-423b-88a0-25b5ec80c0ff' and is_active for update;
 if not found then raise exception 'WALLET_CHANGED'; end if;
 before_wallet:=public.calculate_nodal_wallet_balance('6debf2ca-e899-430b-a07b-51830f7cda10');
 contribution_id:=public.create_nodal_wallet_movement('6948ded1-7fa4-44e4-87a3-4013a51ad506','6debf2ca-e899-430b-a07b-51830f7cda10','2026-11-16','external_contribution',1150000,0,'Aporte extra 16/11: US$11475 netos al broker + US$25 de comisión; instrucción expresa del titular.');
 select c.daily_control_id into control_id from public.confirm_nodal_daily_control(target_period_id=>'6948ded1-7fa4-44e4-87a3-4013a51ad506',target_kind=>'deposit',target_operated_on=>'2026-11-16',target_confirmation_key=>'7f7c42cd-6cab-4fad-8f41-3330e7b8db44',target_amount_cents=>1147500,target_origin_destination=>'Saldo billetera',target_observations=>'Aporte extra16/11 vía billetera; neto broker11475, comisión25. Pendiente eae53f74 conciliado.',target_source=>'manual') c;
 update public.daily_controls set wallet_id='6debf2ca-e899-430b-a07b-51830f7cda10',transfer_fee_cents=2500,received_balance_cents=1195900,updated_by=auth.uid() where id=control_id;
 insert into public.wallet_movements(period_id,wallet_id,daily_control_id,occurred_on,kind,amount_cents,fee_cents,observation,created_by,updated_by) values('6948ded1-7fa4-44e4-87a3-4013a51ad506','6debf2ca-e899-430b-a07b-51830f7cda10',control_id,'2026-11-16','wallet_to_broker',1147500,2500,'Aporte extra16/11: transferencia al broker confirmada por titular.',auth.uid(),auth.uid()) returning id into transfer_id;
 update public.ninja_broker_balance_events set status='confirmed',daily_control_id=control_id,resolved_at=now() where id=event.id;
 after_wallet:=public.calculate_nodal_wallet_balance('6debf2ca-e899-430b-a07b-51830f7cda10');
 if after_wallet<>before_wallet then raise exception 'WALLET_NOT_BALANCED'; end if;
 if not exists(select 1 from public.daily_controls where id=control_id and balance_before_cents=48400 and balance_after_cents=1195900 and operating_result_cents is null) then raise exception 'BROKER_NOT_BALANCED'; end if;
 insert into public.audit_events(actor_user_id,entity_table,entity_id,action,previous_data,current_data,reason) values(auth.uid(),'ninja_broker_balance_events',event.id,'mauricio_external_wallet_broker_20261116',to_jsonb(event),jsonb_build_object('contribution_id',contribution_id,'transfer_id',transfer_id,'control_id',control_id,'contribution_cents',1150000,'net_broker_cents',1147500,'fee_cents',2500,'wallet_before',before_wallet,'wallet_after',after_wallet),'Titular confirma aporte extra sobre484 y solicita saldo billetera seguido de transferencia broker; sin nueva opción de producto.');
end$$;
select 'Saldo broker USD' as control,(balance_after_cents/100.0)::text as resultado from public.daily_controls where confirmation_key='7f7c42cd-6cab-4fad-8f41-3330e7b8db44' union all select 'Pendiente confirmado',status::text from public.ninja_broker_balance_events where id='eae53f74-6224-49c6-bd8d-01fa92062ac3' union all select 'Saldo billetera USD',(public.calculate_nodal_wallet_balance('6debf2ca-e899-430b-a07b-51830f7cda10')/100.0)::text;
rollback;
