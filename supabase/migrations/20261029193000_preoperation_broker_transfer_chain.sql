-- Preserva una transferencia broker observada antes de una operación y permite
-- conciliarla sin deformarla con los cierres que ocurrieron después.

create or replace function public.reconcile_nodal_preoperation_broker_transfer(
  target_event_id uuid,
  target_period_id uuid,
  target_wallet_id uuid,
  target_occurred_on date,
  target_kind text,
  target_fee_cents bigint default 0,
  target_observation text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_event public.ninja_broker_balance_events%rowtype;
  created_movement_id uuid;
  created_control_id uuid;
  candidate record;
  expected_balance bigint;
  latest_balance bigint;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;

  select events.* into selected_event
  from public.ninja_broker_balance_events events
  join public.ninja_connectors connectors on connectors.id = events.connector_id
  where events.id = target_event_id
    and connectors.owner_user_id = actor_id
    and events.status = 'pending'
    and events.source_event_id like 'ninja-preoperation:%'
  for update of events;
  if not found then raise exception 'PREOPERATION_TRANSFER_EVENT_INVALID'; end if;

  expected_balance := nullif(
    selected_event.source_accounts -> 0 ->> 'expectedBalanceInCents',
    ''
  )::bigint;
  select controls.balance_after_cents into latest_balance
  from public.daily_controls controls
  join public.periods periods on periods.id = controls.period_id
  where periods.workspace_id = (
    select target_period.workspace_id
    from public.periods target_period
    where target_period.id = target_period_id
  )
  order by periods.period_month desc, controls.control_number desc
  limit 1;
  if expected_balance is null or latest_balance is distinct from expected_balance then
    raise exception 'PREOPERATION_TRANSFER_BASELINE_CHANGED';
  end if;

  created_movement_id := public.reconcile_nodal_wallet_broker_transfer(
    target_period_id,
    target_wallet_id,
    target_occurred_on,
    target_kind,
    selected_event.balance_cents,
    target_fee_cents,
    target_observation
  );

  select movements.daily_control_id into strict created_control_id
  from public.wallet_movements movements
  where movements.id = created_movement_id;

  update public.ninja_broker_balance_events
  set status = 'confirmed', daily_control_id = created_control_id,
      resolved_at = now()
  where id = selected_event.id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id, 'ninja_broker_balance_events', selected_event.id,
    'ninja_preoperation_transfer_reconciled',
    jsonb_build_object(
      'daily_control_id', created_control_id,
      'movement_id', created_movement_id,
      'observed_balance_cents', selected_event.balance_cents,
      'observed_at', selected_event.observed_at
    ),
    'Transferencia broker preservada antes de una operación y conciliada sin usar el saldo posterior'
  );

  for candidate in
    select batches.id, round(sessions.opening_balance * 100)::bigint as opening_cents
    from public.ninja_operation_batches batches
    join public.ninja_operation_probe_sessions sessions
      on sessions.id = batches.broker_session_id
    where batches.connector_id = selected_event.connector_id
      and batches.accounting_period_id = target_period_id
      and batches.status = 'ready'
      and batches.accounting_status = 'blocked'
      and batches.accounting_blocking_reason = 'El saldo inicial no coincide con el último saldo contable'
      and sessions.status = 'closed'
      and batches.opened_at >= selected_event.observed_at
    order by batches.opened_at, batches.id
  loop
    select controls.balance_after_cents into latest_balance
    from public.daily_controls controls
    where controls.period_id = target_period_id
    order by controls.control_number desc
    limit 1;
    exit when latest_balance is distinct from candidate.opening_cents;

    update public.ninja_operation_batches
    set accounting_status = 'shadow_ready', accounting_mode = 'shadow',
        accounting_blocking_reason = null, updated_at = now()
    where id = candidate.id;
    perform public.commit_ninja_automatic_operation_batch(candidate.id);
  end loop;

  return created_movement_id;
end;
$$;

revoke all on function public.reconcile_nodal_preoperation_broker_transfer(uuid,uuid,uuid,date,text,bigint,text)
from public, anon;
grant execute on function public.reconcile_nodal_preoperation_broker_transfer(uuid,uuid,uuid,date,text,bigint,text)
to authenticated;

comment on function public.reconcile_nodal_preoperation_broker_transfer(uuid,uuid,uuid,date,text,bigint,text)
is 'Concilia el saldo broker preservado justo antes de una operación y libera en orden los cierres bloqueados que continúan esa cadena.';

-- Reparación auditable del caso Franco Seco del 29/10/2026. La transferencia
-- GrabrFi -> broker se acreditó durante la espera previa al primer trade.
do $$
declare
  target_owner_id constant uuid := 'ca3dca6d-7ff2-4f92-957d-f3cb2c7553bf';
  target_actor_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_connector_id constant uuid := '038a26a3-d9e8-44cf-91f9-ddc9054beff5';
  target_period_id constant uuid := 'e6869570-7e74-4a57-927e-40d7261e54ac';
  target_wallet_id constant uuid := 'd362a5f6-625c-418c-9d54-ed8cd256b518';
  target_control_id uuid;
  target_movement_id uuid;
  target_event_id uuid;
  selected_batch_id uuid;
  committed_control_id uuid;
  latest_control public.daily_controls%rowtype;
  expected_batch_ids constant uuid[] := array[
    '25ff737b-3462-45b4-b208-47b291d1f4e2'::uuid,
    '56f51046-598e-43dd-abcd-72ffbe10d5cd'::uuid,
    '1009e5ef-3d95-4955-8b8d-ef7f12b28542'::uuid
  ];
begin
  if exists (
    select 1 from public.audit_events events
    where events.action = 'franco_grabrfi_preoperation_chain_repaired'
  ) then return; end if;

  select controls.* into strict latest_control
  from public.daily_controls controls
  where controls.period_id = target_period_id
  order by controls.control_number desc
  limit 1
  for update;
  if latest_control.control_number <> 13 or latest_control.balance_after_cents <> 163781 then
    raise exception 'FRANCO_REPAIR_UNEXPECTED_CONTROL_BASELINE';
  end if;
  if public.calculate_nodal_wallet_balance(target_wallet_id) is distinct from 178455 then
    raise exception 'FRANCO_REPAIR_UNEXPECTED_WALLET_BALANCE';
  end if;
  if (
    select count(*) from public.ninja_operation_batches batches
    where batches.id = any(expected_batch_ids)
      and batches.connector_id = target_connector_id
      and batches.accounting_period_id = target_period_id
      and batches.accounting_status = 'blocked'
      and batches.daily_control_id is null
  ) <> 3 then raise exception 'FRANCO_REPAIR_UNEXPECTED_BATCH_STATE'; end if;

  insert into public.daily_controls(
    period_id, control_number, operated_on, kind, movement_cents,
    origin_destination, balance_before_cents, balance_after_cents,
    operating_result_cents, observations, source, confirmation_key,
    created_by, created_at, updated_by, updated_at, wallet_id,
    transfer_fee_cents
  ) values (
    target_period_id, 14, date '2026-10-29', 'deposit', 176946,
    'Saldo billetera', 163781, 340727,
    null, 'Transferencia GrabrFi a broker acreditada antes de la operación de las 11:39.',
    'manual', gen_random_uuid(), target_owner_id,
    timestamptz '2026-10-29 14:36:43+00', target_owner_id,
    timestamptz '2026-10-29 14:36:43+00', target_wallet_id, 1500
  ) returning id into target_control_id;

  insert into public.wallet_movements(
    period_id, wallet_id, daily_control_id, occurred_on, kind,
    amount_cents, fee_cents, observation, created_by, created_at,
    updated_by, updated_at
  ) values (
    target_period_id, target_wallet_id, target_control_id, date '2026-10-29',
    'wallet_to_broker', 176946, 1500,
    'Payout GrabrFi enviado al broker; comisión de transferencia US$ 15,00.',
    target_owner_id, timestamptz '2026-10-29 14:36:43+00',
    target_owner_id, timestamptz '2026-10-29 14:36:43+00'
  ) returning id into target_movement_id;

  insert into public.ninja_broker_balance_events(
    connector_id, source_event_id, observed_at, balance_cents,
    source_accounts, status, daily_control_id, resolved_at, created_at
  ) values (
    target_connector_id, 'ninja-preoperation:867735',
    timestamptz '2026-10-29 14:36:43+00', 340727,
    jsonb_build_array(jsonb_build_object(
      'accountName', '2196146', 'connectionName', 'En Vivo',
      'balanceInCents', 340727
    )), 'confirmed', target_control_id, now(), now()
  )
  on conflict(connector_id, source_event_id) do update set
    status = 'confirmed', daily_control_id = excluded.daily_control_id,
    resolved_at = coalesce(public.ninja_broker_balance_events.resolved_at, now())
  returning id into target_event_id;

  foreach selected_batch_id in array expected_batch_ids loop
    update public.ninja_operation_batches
    set accounting_status = 'shadow_ready', accounting_mode = 'shadow',
        accounting_blocking_reason = null, updated_at = now()
    where id = selected_batch_id;
    committed_control_id := public.commit_ninja_automatic_operation_batch(selected_batch_id);
    if committed_control_id is null then
      raise exception 'FRANCO_REPAIR_BATCH_NOT_COMMITTED:%', selected_batch_id;
    end if;
  end loop;

  select controls.* into strict latest_control
  from public.daily_controls controls
  where controls.period_id = target_period_id
  order by controls.control_number desc
  limit 1;
  if latest_control.control_number <> 17 or latest_control.balance_after_cents <> 289931 then
    raise exception 'FRANCO_REPAIR_UNEXPECTED_FINAL_BALANCE';
  end if;
  if public.calculate_nodal_wallet_balance(target_wallet_id) is distinct from 9 then
    raise exception 'FRANCO_REPAIR_UNEXPECTED_FINAL_WALLET_BALANCE';
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    target_actor_id, 'daily_controls', target_control_id,
    'franco_grabrfi_preoperation_chain_repaired',
    jsonb_build_object(
      'owner_user_id', target_owner_id,
      'wallet_id', target_wallet_id,
      'wallet_movement_id', target_movement_id,
      'broker_balance_before_cents', 163781,
      'gross_wallet_debit_cents', 178446,
      'transfer_fee_cents', 1500,
      'broker_balance_after_transfer_cents', 340727,
      'committed_batch_ids', expected_batch_ids,
      'final_broker_balance_cents', 289931
    ),
    'Reparación excepcional autorizada: transferencia histórica y tres operaciones posteriores encadenadas'
  );
end;
$$;
