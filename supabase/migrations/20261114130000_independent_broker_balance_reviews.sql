begin;

-- Serialize evidence per destination; an unrelated pending event is not a lock.
create or replace function public.record_ninja_broker_balance_difference(
  target_connector_id uuid, target_source_event_id text, target_account_name text,
  target_connection_name text, target_balance_cents bigint, target_expected_cents bigint,
  target_observed_at timestamptz, target_baseline_at timestamptz default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare previous public.ninja_broker_balance_events%rowtype;
  expected_cents bigint := target_expected_cents;
  trade_change bigint;
begin
  if target_source_event_id not like 'ninja-preoperation:%' or target_account_name is null
    or target_connection_name is null or target_observed_at is null
    or target_balance_cents is null or target_balance_cents < 0
    or expected_cents is null or expected_cents < 0 then
    raise exception 'BROKER_DIFFERENCE_INVALID';
  end if;
  perform 1 from public.ninja_connectors where id=target_connector_id and status='active' for update;
  if not found then raise exception 'Connector is not active'; end if;
  if exists(select 1 from public.ninja_broker_balance_events
    where connector_id=target_connector_id and source_event_id=target_source_event_id) then return false; end if;

  select e.* into previous from public.ninja_broker_balance_events e
  where e.connector_id=target_connector_id and e.status='pending'
    and e.source_event_id like 'ninja-preoperation:%'
    and e.observed_at<=target_observed_at
    and e.source_accounts->0->>'accountName'=target_account_name
    and e.source_accounts->0->>'connectionName'=target_connection_name
    and ((target_baseline_at is not null and e.observed_at>=target_baseline_at)
      or (target_baseline_at is null and e.source_accounts->0->>'expectedBalanceInCents'=target_expected_cents::text))
  order by e.observed_at desc,e.id limit 1;
  if found then
    -- Carry the existing cash observation through proven trades. Do not turn
    -- their PnL into another movement, or guess through incomplete executions.
    if exists(select 1 from public.ninja_operation_probe_sessions s
      where s.connector_id=target_connector_id and s.account_name=target_account_name
        and s.connection_name=target_connection_name and s.opened_at>=previous.observed_at
        and s.opened_at<target_observed_at
        and (s.status<>'closed' or not s.result_verified or s.result_conflict
          or s.opening_balance is null or s.closing_balance is null or s.settled_at is null or s.settled_at>target_observed_at)) then return false; end if;
    select coalesce(sum(round((s.closing_balance-s.opening_balance)*100)::bigint),0) into trade_change
    from public.ninja_operation_probe_sessions s
    where s.connector_id=target_connector_id and s.account_name=target_account_name
      and s.connection_name=target_connection_name and s.opened_at>=previous.observed_at
      and s.opened_at<target_observed_at and s.status='closed' and s.result_verified and not s.result_conflict
      and s.settled_at<=target_observed_at;
    expected_cents:=previous.balance_cents+trade_change;
  end if;
  if target_balance_cents=expected_cents then return false; end if;
  insert into public.ninja_broker_balance_events(connector_id,source_event_id,observed_at,balance_cents,source_accounts)
  values(target_connector_id,target_source_event_id,target_observed_at,target_balance_cents,
    jsonb_build_array(jsonb_build_object('accountName',target_account_name,'connectionName',target_connection_name,
      'balanceInCents',target_balance_cents,'expectedBalanceInCents',expected_cents,'baselineObservedAt',target_baseline_at)))
  on conflict(connector_id,source_event_id) do nothing;
  return found;
end $$;
revoke all on function public.record_ninja_broker_balance_difference(uuid,text,text,text,bigint,bigint,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.record_ninja_broker_balance_difference(uuid,text,text,text,bigint,bigint,timestamptz,timestamptz) to service_role;

-- Flat cash and realized PnL from consecutive inventories distinguish a cash
-- change from a completed trade without waiting for the next operation.
create or replace function public.observe_ninja_broker_inventory_difference(
  target_connector_id uuid,target_source_event_id text,target_account_name text,target_connection_name text,
  target_balance_cents bigint,target_realized_cents bigint,target_observed_at timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
declare prior record; expected_cents bigint; first_stable_at timestamptz;
  current_receipt bigint; cutoff_at timestamptz; baseline_at timestamptz; opening_cash bigint;
begin
  perform 1 from public.ninja_connectors where id=target_connector_id and status='active' and identity_id is null for update;
  if not found then return false; end if;
  if exists(select 1 from public.ninja_inventory_snapshots where connector_id=target_connector_id and observed_at>target_observed_at) then return false; end if;
  select greatest(opening.created_at,opening.updated_at),opening.broker_balance_cents into cutoff_at,opening_cash
  from public.period_opening_snapshots opening
  join public.periods p on p.id=opening.period_id join public.workspaces w on w.id=p.workspace_id
  join public.ninja_connectors c on c.owner_user_id=w.owner_user_id and c.id=target_connector_id
  where w.modality='real' order by p.period_month desc limit 1;
  if cutoff_at is null or cutoff_at>target_observed_at then return false; end if;
  select coalesce(d.received_balance_cents,d.balance_after_cents),d.created_at into current_receipt,baseline_at
  from public.daily_controls d join public.periods p on p.id=d.period_id
  join public.workspaces w on w.id=p.workspace_id
  join public.ninja_connectors c on c.owner_user_id=w.owner_user_id and c.id=target_connector_id
  where w.modality='real' and d.created_at<=target_observed_at and d.created_at>=cutoff_at
  order by p.period_month desc,d.control_number desc limit 1;
  current_receipt:=coalesce(current_receipt,opening_cash);
  baseline_at:=coalesce(baseline_at,cutoff_at);
  if current_receipt=target_balance_cents then return false; end if;
  select snapshots.observed_at,accounts.value into prior
  from public.ninja_inventory_snapshots snapshots
  cross join lateral jsonb_array_elements(snapshots.accounts) accounts(value)
  where snapshots.connector_id=target_connector_id and snapshots.observed_at<target_observed_at
    and snapshots.observed_at>=target_observed_at-interval '30 minutes'
    and snapshots.observed_at>=cutoff_at
    and accounts.value->>'accountName'=target_account_name
    and accounts.value->>'connectionName'=target_connection_name
    and lower(accounts.value->>'connectionStatus')='connected'
    and accounts.value->>'cashValue' is not null and accounts.value->>'realizedProfitLoss' is not null
    and (accounts.value->>'unrealizedProfitLoss')::numeric=0
    and (accounts.value->>'cashValue')::numeric=(accounts.value->>'netLiquidation')::numeric
    and exists(select 1 from public.ninja_inventory_snapshots stable
      cross join lateral jsonb_array_elements(stable.accounts) a(value)
      where stable.connector_id=target_connector_id and stable.observed_at>=greatest(cutoff_at,snapshots.observed_at-interval '30 minutes')
        and stable.observed_at<=snapshots.observed_at-interval '10 seconds'
        and a.value->>'accountName'=target_account_name and a.value->>'connectionName'=target_connection_name
        and (a.value->>'cashValue')::numeric=(accounts.value->>'cashValue')::numeric
        and (a.value->>'realizedProfitLoss')::numeric=(accounts.value->>'realizedProfitLoss')::numeric
        and (a.value->>'unrealizedProfitLoss')::numeric=0
        and (a.value->>'cashValue')::numeric=(a.value->>'netLiquidation')::numeric)
    and (round((accounts.value->>'cashValue')::numeric*100)::bigint<>target_balance_cents
      or round((accounts.value->>'realizedProfitLoss')::numeric*100)::bigint<>target_realized_cents)
  order by snapshots.observed_at desc,snapshots.event_id desc limit 1;
  if found and (prior.observed_at at time zone 'UTC')::date=(target_observed_at at time zone 'UTC')::date then
    expected_cents:=round((prior.value->>'cashValue')::numeric*100)::bigint
      +target_realized_cents-round((prior.value->>'realizedProfitLoss')::numeric*100)::bigint;
    baseline_at:=prior.observed_at;
  else
    -- No safe same-day PnL comparison: retain a neutral cash discrepancy
    -- against the latest confirmed receipt, not an inferred transfer.
    expected_cents:=current_receipt;
  end if;
  if expected_cents is null or expected_cents<0 or expected_cents=target_balance_cents then return false; end if;
  -- Cash and PnL callbacks can arrive separately. Require the changed reading
  -- to repeat after the same quiet window used to settle executions.
  select min(s.observed_at) into first_stable_at
  from public.ninja_inventory_snapshots s
  cross join lateral jsonb_array_elements(s.accounts) a(value)
  where s.connector_id=target_connector_id and s.observed_at>baseline_at and s.observed_at<=target_observed_at
    and s.observed_at>=target_observed_at-interval '30 minutes'
    and a.value->>'accountName'=target_account_name and a.value->>'connectionName'=target_connection_name
    and round((a.value->>'cashValue')::numeric*100)::bigint=target_balance_cents
    and round((a.value->>'realizedProfitLoss')::numeric*100)::bigint=target_realized_cents
    and (a.value->>'unrealizedProfitLoss')::numeric=0
    and (a.value->>'cashValue')::numeric=(a.value->>'netLiquidation')::numeric;
  if first_stable_at is null or target_observed_at-first_stable_at<interval '10 seconds' then return false; end if;
  return public.record_ninja_broker_balance_difference(target_connector_id,
    'ninja-preoperation:inventory:'||target_source_event_id,target_account_name,target_connection_name,
    target_balance_cents,expected_cents,target_observed_at,baseline_at);
end $$;
revoke all on function public.observe_ninja_broker_inventory_difference(uuid,text,text,text,bigint,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.observe_ninja_broker_inventory_difference(uuid,text,text,text,bigint,bigint,timestamptz) to service_role;
commit;
