begin;
create schema if not exists private_broker_review_single_20261116;
create table if not exists private_broker_review_single_20261116.functions_before(name text primary key,definition text not null);
alter table private_broker_review_single_20261116.functions_before enable row level security;
revoke all on schema private_broker_review_single_20261116 from public,anon,authenticated;
revoke all on all tables in schema private_broker_review_single_20261116 from public,anon,authenticated;
insert into private_broker_review_single_20261116.functions_before
select proname,pg_get_functiondef(oid) from pg_proc where pronamespace='public'::regnamespace and proname in('observe_ninja_broker_inventory_difference','record_ninja_broker_balance_difference','reconcile_nodal_preoperation_broker_transfer','get_nodalito_repair_context') on conflict do nothing;

alter table public.ninja_broker_balance_events add column if not exists superseded_at timestamptz,
 add column if not exists superseded_reason text;
comment on column public.ninja_broker_balance_events.superseded_at is 'Unconfirmed review subsequently explained by original PnL evidence; retained, never a confirmed transfer.';

-- Superseded evidence cannot become a financial transfer or a reference for a new one.
do $$declare definition text;begin
 select pg_get_functiondef('public.record_ninja_broker_balance_difference(uuid,text,text,text,bigint,bigint,timestamptz,timestamptz)'::regprocedure) into definition;
 if strpos(definition,'NODAL_SINGLE_INVENTORY_REVIEW')=0 then
  if strpos(definition,$s$e.status='pending'$s$)=0 then raise exception 'Difference function changed'; end if;
  definition:=replace(definition,$s$e.status='pending'$s$,$s$e.status='pending' and e.superseded_at is null /* NODAL_SINGLE_INVENTORY_REVIEW */$s$);
  execute definition;
 end if;
 select pg_get_functiondef('public.reconcile_nodal_preoperation_broker_transfer(uuid,uuid,uuid,date,text,bigint,text)'::regprocedure) into definition;
 if strpos(definition,'NODAL_SINGLE_INVENTORY_REVIEW')=0 then
  if strpos(definition,$s$and events.status = 'pending'$s$)=0 then raise exception 'Transfer function changed'; end if;
  definition:=replace(definition,$s$and events.status = 'pending'$s$,$s$and events.status = 'pending' and events.superseded_at is null /* NODAL_SINGLE_INVENTORY_REVIEW */$s$);
  execute definition;
 end if;
 select pg_get_functiondef('public.get_nodalito_repair_context()'::regprocedure) into definition;
 if strpos(definition,'NODAL_SINGLE_INVENTORY_REVIEW')=0 then
  if strpos(definition,$s$e.status='pending'$s$)=0 then raise exception 'Nodalito context changed'; end if;
  execute replace(definition,$s$e.status='pending'$s$,$s$e.status='pending' and e.superseded_at is null /* NODAL_SINGLE_INVENTORY_REVIEW */$s$);
 end if;
end$$;

create or replace function public.observe_ninja_broker_inventory_difference(
 target_connector_id uuid,target_source_event_id text,target_account_name text,target_connection_name text,
 target_balance_cents bigint,target_realized_cents bigint,target_observed_at timestamptz
) returns boolean language plpgsql security definer set search_path='' as $$
declare prior record; expected_cents bigint; current_receipt bigint; cutoff_at timestamptz;
 baseline_at timestamptz; opening_cash bigint; created boolean; review record;
begin
 perform 1 from public.ninja_connectors where id=target_connector_id and status='active' and identity_id is null for update;
 if not found then return false; end if;
 -- This RPC also verifies the raw coherent observation, not just its caller's numbers.
 if not exists(select 1 from public.ninja_inventory_snapshots s cross join lateral jsonb_array_elements(s.accounts) a(value)
  where s.connector_id=target_connector_id and s.event_id=target_source_event_id and s.observed_at=target_observed_at
   and a.value->>'accountName'=target_account_name and a.value->>'connectionName'=target_connection_name
   and lower(a.value->>'connectionStatus')='connected'
   and round((a.value->>'cashValue')::numeric*100)::bigint=target_balance_cents
   and (a.value->>'cashValue')::numeric=(a.value->>'netLiquidation')::numeric
   and round((a.value->>'realizedProfitLoss')::numeric*100)::bigint=target_realized_cents
   and (a.value->>'unrealizedProfitLoss')::numeric=0) then return false; end if;
 if exists(select 1 from public.ninja_inventory_snapshots s cross join lateral jsonb_array_elements(s.accounts) a(value)
  where s.connector_id=target_connector_id and s.observed_at>target_observed_at
   and a.value->>'accountName'=target_account_name and a.value->>'connectionName'=target_connection_name) then return false; end if;
 select greatest(o.created_at,o.updated_at),o.broker_balance_cents into cutoff_at,opening_cash
 from public.period_opening_snapshots o join public.periods p on p.id=o.period_id join public.workspaces w on w.id=p.workspace_id
 join public.ninja_connectors c on c.owner_user_id=w.owner_user_id and c.id=target_connector_id
 where w.modality='real' order by p.period_month desc limit 1;
 if cutoff_at is null or cutoff_at>target_observed_at then return false; end if;
 select coalesce(d.received_balance_cents,d.balance_after_cents),d.created_at into current_receipt,baseline_at
 from public.daily_controls d join public.periods p on p.id=d.period_id join public.workspaces w on w.id=p.workspace_id
 join public.ninja_connectors c on c.owner_user_id=w.owner_user_id and c.id=target_connector_id
 where w.modality='real' and d.created_at<=target_observed_at and d.created_at>=cutoff_at
 order by p.period_month desc,d.control_number desc limit 1;
 current_receipt:=coalesce(current_receipt,opening_cash); baseline_at:=coalesce(baseline_at,cutoff_at);

 -- Cash and PnL may arrive separately. An unconfirmed candidate explained by
 -- later coherent PnL is withdrawn from review, with evidence retained.
 for review in select e.* from public.ninja_broker_balance_events e where e.connector_id=target_connector_id
  and e.status='pending' and e.superseded_at is null and e.source_event_id like 'ninja-preoperation:inventory:%'
  and e.observed_at<target_observed_at and (e.observed_at at time zone 'UTC')::date=(target_observed_at at time zone 'UTC')::date
  and e.source_accounts->0->>'accountName'=target_account_name and e.source_accounts->0->>'connectionName'=target_connection_name
  and e.source_accounts->0->>'referenceRealizedInCents' is not null
  and e.source_accounts->0->>'referenceBalanceInCents' is not null
 loop
  if target_balance_cents=(review.source_accounts->0->>'referenceBalanceInCents')::bigint
    +target_realized_cents-(review.source_accounts->0->>'referenceRealizedInCents')::bigint then
   update public.ninja_broker_balance_events set superseded_at=now(),superseded_reason='Lectura posterior coherente explica la diferencia mediante P&L realizado.' where id=review.id;
   insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
   select owner_user_id,'ninja_broker_balance_events',review.id,'broker_inventory_review_superseded',
    jsonb_build_object('explaining_inventory',target_source_event_id,'observed_at',target_observed_at),
    'Se retiró un pendiente no confirmado; no se modificó la contabilidad.' from public.ninja_connectors where id=target_connector_id;
  end if;
 end loop;
 if current_receipt=target_balance_cents then return false; end if;
 -- A single verified reference is sufficient. Its age does not discard a
 -- genuine difference; across a PnL reset use a neutral confirmed-cash reference.
 select s.observed_at,a.value into prior from public.ninja_inventory_snapshots s
 cross join lateral jsonb_array_elements(s.accounts) a(value)
 where s.connector_id=target_connector_id and s.observed_at<target_observed_at and s.observed_at>=cutoff_at
  and not exists(select 1 from public.ninja_broker_balance_events pending
   where pending.connector_id=s.connector_id and pending.status='pending'
    and pending.source_event_id='ninja-preoperation:inventory:'||s.event_id)
  and a.value->>'accountName'=target_account_name and a.value->>'connectionName'=target_connection_name
  and lower(a.value->>'connectionStatus')='connected' and a.value->>'cashValue' is not null
  and a.value->>'realizedProfitLoss' is not null and (a.value->>'unrealizedProfitLoss')::numeric=0
  and (a.value->>'cashValue')::numeric=(a.value->>'netLiquidation')::numeric
  and (round((a.value->>'cashValue')::numeric*100)::bigint<>target_balance_cents
   or round((a.value->>'realizedProfitLoss')::numeric*100)::bigint<>target_realized_cents)
 order by s.observed_at desc,s.event_id desc limit 1;
 if found and (prior.observed_at at time zone 'UTC')::date=(target_observed_at at time zone 'UTC')::date then
  expected_cents:=round((prior.value->>'cashValue')::numeric*100)::bigint
   +target_realized_cents-round((prior.value->>'realizedProfitLoss')::numeric*100)::bigint;
  baseline_at:=prior.observed_at;
 else expected_cents:=current_receipt; end if;
 if expected_cents is null or expected_cents<0 or expected_cents=target_balance_cents then return false; end if;
 created:=public.record_ninja_broker_balance_difference(target_connector_id,'ninja-preoperation:inventory:'||target_source_event_id,
  target_account_name,target_connection_name,target_balance_cents,expected_cents,target_observed_at,baseline_at);
 if created and prior.value is not null and (prior.observed_at at time zone 'UTC')::date=(target_observed_at at time zone 'UTC')::date then
  update public.ninja_broker_balance_events set source_accounts=jsonb_set(source_accounts,'{0}',(source_accounts->0)||jsonb_build_object(
   'referenceBalanceInCents',round((prior.value->>'cashValue')::numeric*100)::bigint,
   'referenceRealizedInCents',round((prior.value->>'realizedProfitLoss')::numeric*100)::bigint))
  where connector_id=target_connector_id and source_event_id='ninja-preoperation:inventory:'||target_source_event_id;
 end if;
 return created;
end$$;
revoke all on function public.observe_ninja_broker_inventory_difference(uuid,text,text,text,bigint,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.observe_ninja_broker_inventory_difference(uuid,text,text,text,bigint,bigint,timestamptz) to service_role;
commit;
