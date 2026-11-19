-- Run only on a disposable PostgreSQL database with the migrated NODAL schema.
create function public.seed_broker_review_case(label text, residual bigint default 0)
returns jsonb language plpgsql as $$
declare
  actor uuid := gen_random_uuid();
  space uuid := gen_random_uuid();
  period uuid := gen_random_uuid();
  wallet uuid := gen_random_uuid();
  connector uuid := gen_random_uuid();
  account uuid := gen_random_uuid();
  trade_batch uuid := gen_random_uuid();
  review uuid := gen_random_uuid();
  company uuid;
  opening_event bigint;
  session_id bigint;
  opened timestamptz := now()-interval '10 minutes';
  closed timestamptz := now()-interval '5 minutes';
  observed timestamptz := now()-interval '2 minutes';
  inventory_key text := 'fixture:' || gen_random_uuid()::text;
begin
  insert into auth.users(id,email) values(actor, actor||'@example.invalid');
  insert into public.nodal_users(id,email,access_state,authorized_at)
    values(actor, actor||'@example.invalid','active',now())
    on conflict(id) do update set access_state='active',authorized_at=now();
  insert into public.workspaces(id,owner_user_id,modality) values(space,actor,'real');
  insert into public.periods(id,workspace_id,period_month,operational_start_on,scheduled_close_at,lifecycle_status)
    values(period,space,date_trunc('month',current_date)::date,current_date-1,now()+interval '7 days','open');
  select id into strict company from public.companies where code='LUCID';
  insert into public.accounts(id,period_id,company_id,reference_number,created_by,workspace_id,opened_period_id)
    values(account,period,company,1,actor,space,period);
  insert into public.nodal_wallets(id,workspace_id,name,created_by) values(wallet,space,'Fixture',actor);
  insert into public.wallet_movements(period_id,wallet_id,occurred_on,kind,amount_cents,fee_cents,created_by,updated_by)
    values(period,wallet,current_date,'external_contribution',100000,0,actor,actor);
  insert into public.period_opening_snapshots(period_id,start_mode,cutover_date,created_by,broker_balance_cents)
    values(period,'reconstruct',current_date-1,actor,1195900);
  insert into public.ninja_connectors(id,owner_user_id,connector_version,access_token_hash,access_expires_at,refresh_token_hash,refresh_expires_at)
    values(connector,actor,'fixture',gen_random_uuid()::text,now()+interval '1 day',gen_random_uuid()::text,now()+interval '1 day');
  insert into public.ninja_trade_telemetry_events(connector_id,event_id,event_type,occurred_at,connection_name,account_name,instrument,payload,physical_connector_id)
    values(connector,gen_random_uuid()::text,'execution',opened,'En Vivo','TEST-BROKER','MNQ','{}',connector) returning id into opening_event;
  insert into public.ninja_operation_probe_sessions(connector_id,connection_name,account_name,opening_event_id,opened_at,flat_at,last_event_at,settled_at,status,opening_balance,closing_balance,result,execution_count,instruments,direction,quantity,result_verified,physical_connector_id)
    values(connector,'En Vivo','TEST-BROKER',opening_event,opened,closed,closed,closed,'closed',11959,11543.6,-415.4,2,array['MNQ'],'Short',1,true,connector) returning id into session_id;
  insert into public.ninja_operation_batches(id,connector_id,broker_session_id,status,broker_result_cents,opened_at,settled_at,accounting_status,accounting_period_id,accounting_company_id,accounting_phase,operated_on,broker_balance_scope)
    values(trade_batch,connector,session_id,'ready',-41540,opened,closed,'shadow_ready',period,company,'Evaluacion',current_date,'single');
  insert into public.ninja_operation_batch_members(batch_id,session_id,role,account_id,allocated_broker_result_cents)
    values(trade_batch,session_id,'prop',account,-41540);
  insert into public.ninja_inventory_snapshots(event_id,connector_id,physical_connector_id,observed_at,accounts,account_count)
    values(inventory_key,connector,connector,observed,jsonb_build_array(jsonb_build_object(
      'accountName','TEST-BROKER','connectionName',label,'cashValue',(1154360+residual)::numeric/100,
      'netLiquidation',(1154360+residual)::numeric/100,'unrealizedProfitLoss',0
    )),1);
  insert into public.ninja_broker_balance_events(id,connector_id,source_event_id,observed_at,balance_cents,source_accounts)
    values(review,connector,'ninja-preoperation:inventory:'||inventory_key,observed,1154360+residual,jsonb_build_array(jsonb_build_object('accountName','TEST-BROKER','connectionName',label,'expectedBalanceInCents',1195900,'baselineObservedAt',opened-interval '1 minute')));
  insert into public.ninja_broker_balance_events(connector_id,source_event_id,observed_at,balance_cents,source_accounts)
    values(connector,'ninja-operation:'||opening_event,closed,1154360,'[]');
  return jsonb_build_object('actor',actor,'period',period,'wallet',wallet,'batch',trade_batch,'review',review);
end;
$$;
