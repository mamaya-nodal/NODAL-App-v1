begin;

-- Both entry points serialize changes to the same accounting workspace.
-- Try-lock also protects callers that already hold a batch or period row.
create function public.lock_broker_review_workspace(target_period uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare workspace uuid;
begin
  select p.workspace_id into workspace from public.periods p where p.id = target_period;
  if workspace is not null and not pg_try_advisory_xact_lock(
    hashtextextended('nodal:broker-review:' || workspace::text, 0)
  ) then
    raise exception 'NINJA_BROKER_REVIEW_RETRY' using errcode = '55P03';
  end if;
end;
$$;

revoke all on function public.lock_broker_review_workspace(uuid) from public, anon, authenticated;

do $migration$
declare
  definition text;
  updated text;
  auto_anchor text := 'select * into selected_batch';
  manual_anchor text := 'select events.* into selected_event';
  evidence_anchor text := 'expected_balance := nullif(';
  receipt_anchor text := 'if latest_balance=expected_balance and current_received=latest_balance and latest_control_at<=selected_event.observed_at then';
begin
  select pg_get_functiondef('public.commit_ninja_automatic_operation_batch(uuid)'::regprocedure) into strict definition;
  updated := replace(definition, auto_anchor,
    'perform public.lock_broker_review_workspace((select b.accounting_period_id from public.ninja_operation_batches b where b.id = target_batch_id));'
    || E'\n  ' || auto_anchor);
  if updated = definition then raise exception 'Unexpected automatic broker commit definition'; end if;
  execute updated;

  select pg_get_functiondef('public.reconcile_nodal_preoperation_broker_transfer(uuid,uuid,uuid,date,text,bigint,text)'::regprocedure) into strict definition;
  updated := replace(definition, manual_anchor, $patch$
    if not public.can_access_period(target_period_id) then
      raise exception 'BROKER_TRANSFER_PERIOD_INVALID';
    end if;
    perform public.lock_broker_review_workspace(target_period_id);
  $patch$ || manual_anchor);
  if updated = definition or strpos(updated, evidence_anchor) = 0 or strpos(updated, receipt_anchor) = 0 then
    raise exception 'Unexpected manual broker transfer definition';
  end if;
  updated := replace(updated, evidence_anchor, $patch$
    -- A pre-operation observation is already tied to an opening. For an
    -- inventory observation, wait only on sessions in its reference interval.
    if selected_event.source_event_id like 'ninja-preoperation:inventory:%'
      and exists (
        select 1
        from public.ninja_operation_probe_sessions s
        where s.connector_id = selected_event.connector_id
          and s.account_name = selected_event.source_accounts->0->>'accountName'
          and s.excluded_at is null
          and s.opened_at >= nullif(selected_event.source_accounts->0->>'baselineObservedAt', '')::timestamptz
          and s.opened_at <= selected_event.observed_at
          and (
            (s.status <> 'closed'
              and btrim(s.connection_name) = btrim(selected_event.source_accounts->0->>'connectionName'))
            or (
              -- Identical cash endpoints on another label are enough to stop
              -- a manual transfer, never enough to retire the observation.
              s.opening_balance is not null and s.closing_balance is not null
              and round(s.opening_balance * 100)::bigint::text = selected_event.source_accounts->0->>'expectedBalanceInCents'
              and (
                round(s.closing_balance * 100)::bigint = selected_event.balance_cents
                or (
                  btrim(s.connection_name) = btrim(selected_event.source_accounts->0->>'connectionName')
                  and s.settled_at <= selected_event.observed_at
                  and not exists (
                    select 1 from public.ninja_operation_batches b
                    where b.connector_id = s.connector_id and b.broker_session_id = s.id
                      and b.accounting_status = 'committed'
                  )
                )
              )
            )
          )
      ) then
        raise exception 'PREOPERATION_TRANSFER_REVIEW_REQUIRED'
          using detail = 'A Ninja session may explain the broker balance difference';
    end if;
  $patch$ || evidence_anchor);
  updated := replace(updated, receipt_anchor, $patch$
    if selected_event.source_accounts->0?'reconciledTradeControlId' then
      -- The residual is usable only while the verified trade is still the
      -- latest ledger entry. Read again under the workspace lock.
      if target_period_id is distinct from (
          select c.period_id from public.daily_controls c
          where c.id::text = selected_event.source_accounts->0->>'reconciledTradeControlId'
        ) or not exists (
          select 1 from public.daily_controls c
          where c.id = (
            select recent.id from public.daily_controls recent
            join public.periods rp on rp.id = recent.period_id
            where rp.workspace_id = (select p.workspace_id from public.periods p where p.id = target_period_id)
            order by rp.period_month desc, recent.control_number desc limit 1
          )
            and c.id::text = selected_event.source_accounts->0->>'reconciledTradeControlId'
            and c.balance_after_cents = expected_balance
        ) or current_received is distinct from latest_balance then
        raise exception 'PREOPERATION_TRANSFER_REVIEW_REQUIRED';
      end if;
      current_received := selected_event.balance_cents;
    els$patch$ || receipt_anchor);
  execute updated;
end;
$migration$;

create function public.retire_broker_inventory_review_on_trade_commit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The pending-event index bounds this lookup to one connector and interval.
  if not exists (
    select 1 from public.ninja_broker_balance_events review
    where review.connector_id = new.connector_id
      and review.status = 'pending' and review.superseded_at is null
      and review.observed_at >= new.settled_at
  ) then
    return new;
  end if;

  with explained as (
    update public.ninja_broker_balance_events review
    set superseded_at = case when review.balance_cents = control.balance_after_cents then now() end,
        superseded_reason = case when review.balance_cents = control.balance_after_cents
          then 'Diferencia explicada por el cierre verificado del lote ' || new.id::text end,
        source_accounts = case when review.balance_cents = control.balance_after_cents then review.source_accounts
          else jsonb_set(review.source_accounts, '{0}', (review.source_accounts->0) || jsonb_build_object(
            'originalExpectedBalanceInCents', control.balance_before_cents,
            'expectedBalanceInCents', control.balance_after_cents,
            'reconciledTradeControlId', control.id
          )) end
    from public.daily_controls control
    join public.ninja_operation_probe_sessions session on session.id = new.broker_session_id
    join public.ninja_broker_balance_events receipt
      on receipt.connector_id = new.connector_id
     and receipt.source_event_id = 'ninja-operation:' || session.opening_event_id::text
     and receipt.status = 'confirmed'
     and receipt.daily_control_id = control.id
    where control.id = new.daily_control_id
      and control.kind = 'balance_update'
      and session.connector_id = new.connector_id
      and session.status = 'closed' and session.result_verified and not session.result_conflict
      and session.physical_connector_id is not null
      and control.balance_before_cents = round(session.opening_balance * 100)::bigint
      and control.balance_after_cents = round(session.closing_balance * 100)::bigint
      and control.balance_after_cents - control.balance_before_cents = new.broker_result_cents
      and control.operating_result_cents = new.broker_result_cents
      and round(session.result * 100)::bigint = new.broker_result_cents
      and receipt.balance_cents = control.balance_after_cents
      and review.connector_id = new.connector_id
      and review.status = 'pending' and review.superseded_at is null
      and review.daily_control_id is null
      and review.observed_at >= new.settled_at and review.observed_at <= control.created_at
      and review.source_event_id like 'ninja-preoperation:inventory:%'
      and jsonb_array_length(review.source_accounts) = 1
      and not (review.source_accounts->0?'reconciledTradeControlId')
      and review.source_accounts->0->>'expectedBalanceInCents' = control.balance_before_cents::text
      and review.source_accounts->0->>'accountName' = session.account_name
      and btrim(review.source_accounts->0->>'connectionName') = btrim(session.connection_name)
      and exists (
        select 1 from public.ninja_inventory_snapshots snapshot
        where snapshot.event_id = substr(review.source_event_id, length('ninja-preoperation:inventory:') + 1)
          and snapshot.connector_id = review.connector_id
          and snapshot.physical_connector_id = session.physical_connector_id
          and snapshot.observed_at = review.observed_at
          and (review.balance_cents = control.balance_after_cents or exists (
            select 1 from jsonb_array_elements(snapshot.accounts) evidence(value)
            where evidence.value->>'accountName' = session.account_name
              and btrim(evidence.value->>'connectionName') = btrim(session.connection_name)
              and evidence.value @> jsonb_build_object(
                'cashValue', review.balance_cents::numeric / 100,
                'netLiquidation', review.balance_cents::numeric / 100,
                'unrealizedProfitLoss', 0
              )
          ))
      )
      and (review.balance_cents = control.balance_after_cents or not exists (
        select 1 from public.ninja_operation_probe_sessions other_session
        where other_session.connector_id = session.connector_id
          and other_session.account_name = session.account_name
          and other_session.id <> session.id and other_session.excluded_at is null
          and other_session.opened_at >= session.opened_at
          and other_session.opened_at <= review.observed_at
      ))
    returning review.id, review.superseded_at, review.balance_cents - control.balance_after_cents as residual_cents
  )
  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  select connector.owner_user_id, 'ninja_broker_balance_events', explained.id,
         case when explained.superseded_at is not null then 'broker_inventory_review_superseded'
           else 'broker_inventory_review_net_of_trade' end,
         jsonb_build_object('batch_id', new.id, 'control_id', new.daily_control_id, 'residual_cents', explained.residual_cents),
         'Se concilió la parte explicada por el trade. Se conserva la observación original.'
  from explained
  join public.ninja_connectors connector on connector.id = new.connector_id;

  return new;
end;
$$;

revoke all on function public.retire_broker_inventory_review_on_trade_commit() from public, anon, authenticated;

create trigger retire_broker_inventory_review_on_trade_commit
after update of accounting_status on public.ninja_operation_batches
for each row
when (
  old.accounting_status is distinct from new.accounting_status
  and new.accounting_status = 'committed'
  and new.broker_balance_scope = 'single'
  and new.daily_control_id is not null
  and new.settled_at is not null
  and new.broker_result_cents <> 0
)
execute function public.retire_broker_inventory_review_on_trade_commit();

commit;
