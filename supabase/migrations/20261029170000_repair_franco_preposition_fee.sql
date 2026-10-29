-- Repara la primera operación de Franco del 29/10: Ninja descontó US$ 2,87
-- entre la primera ejecución y la posición abierta. La ventana anterior de dos
-- segundos omitió esa ejecución y tomó como apertura el saldo posterior al costo.

begin;

do $repair$
declare
  franco_id constant uuid := 'ca3dca6d-7ff2-4f92-957d-f3cb2c7553bf';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_connector_id constant uuid := '038a26a3-d9e8-44cf-91f9-ddc9054beff5';
  target_period_id constant uuid := 'e6869570-7e74-4a57-927e-40d7261e54ac';
  target_batch_id constant uuid := 'dbf4417e-97a0-43ba-b9e5-ccc9cd3c36db';
  target_session_id constant bigint := 2621449;
  old_opening_event_id constant bigint := 865096;
  corrected_opening_event_id constant bigint := 865082;
  new_control_id uuid;
  changed_count integer;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'ninja_operation_batches'
      and events.entity_id = target_batch_id
      and events.action = 'franco_preposition_fee_repaired'
  ) then
    return;
  end if;

  if not exists (
    select 1 from public.daily_controls controls
    where controls.period_id = target_period_id
      and controls.control_number = 12
      and controls.balance_after_cents = 176355
  ) then
    raise exception 'Franco prior accounting balance changed; aborting controlled repair';
  end if;

  if not exists (
    select 1 from public.ninja_operation_probe_sessions sessions
    where sessions.id = target_session_id
      and sessions.connector_id = target_connector_id
      and sessions.opening_event_id = old_opening_event_id
      and round(sessions.opening_balance * 100)::bigint = 176068
      and round(sessions.closing_balance * 100)::bigint = 163781
      and round(sessions.result * 100)::bigint = -12287
      and sessions.status = 'closed'
  ) then
    raise exception 'Franco broker session changed; aborting controlled repair';
  end if;

  if exists (
    select 1 from public.ninja_operation_probe_sessions sessions
    where sessions.connector_id = target_connector_id
      and sessions.opening_event_id = corrected_opening_event_id
      and sessions.id <> target_session_id
  ) then
    raise exception 'Corrected Franco opening event is already assigned';
  end if;

  if not exists (
    select 1 from public.ninja_operation_batches batches
    where batches.id = target_batch_id
      and batches.connector_id = target_connector_id
      and batches.broker_session_id = target_session_id
      and batches.status = 'ready'
      and batches.accounting_status = 'blocked'
      and batches.broker_result_cents = -12287
      and batches.daily_control_id is null
  ) then
    raise exception 'Franco automatic batch changed; aborting controlled repair';
  end if;

  if (
    select count(*) from public.ninja_operation_batch_members members
    where members.batch_id = target_batch_id
      and members.role = 'prop'
      and members.account_id = 'afe777a2-e4e1-4f9c-b452-3b6362d42eaa'
      and members.allocated_broker_result_cents = -6144
  ) <> 2 then
    raise exception 'Franco prop allocations changed; aborting controlled repair';
  end if;

  update public.ninja_operation_probe_sessions
  set opening_event_id = corrected_opening_event_id,
      opened_at = '2026-10-29T14:23:04.506+00:00',
      opening_balance = 1763.55,
      result = -125.74,
      execution_count = 2,
      updated_at = now()
  where id = target_session_id;

  update public.ninja_operation_batches
  set opened_at = '2026-10-29T14:23:04.506+00:00',
      broker_result_cents = -12574,
      distributed_cents = -12574,
      rounding_difference_cents = 0,
      accounting_mode = 'shadow',
      accounting_status = 'shadow_ready',
      accounting_blocking_reason = null,
      updated_at = now()
  where id = target_batch_id;

  update public.ninja_operation_batch_members
  set allocated_broker_result_cents = -12574
  where batch_id = target_batch_id
    and role = 'prop'
    and session_id = 2621451;
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'Expected the canonical Franco prop allocation, found %', changed_count;
  end if;


  delete from public.ninja_operation_batch_members
  where batch_id = target_batch_id
    and role = 'prop'
    and session_id = 2637840;
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then
    raise exception 'Expected the duplicated Franco prop allocation, found %', changed_count;
  end if;

  update public.ninja_broker_balance_events
  set source_event_id = 'ninja-operation:' || corrected_opening_event_id::text
  where connector_id = target_connector_id
    and source_event_id = 'ninja-operation:' || old_opening_event_id::text
    and status = 'pending'
    and balance_cents = 163781;
  if not found then
    raise exception 'Franco pending broker balance event changed';
  end if;

  new_control_id := public.commit_ninja_automatic_operation_batch(target_batch_id);
  if new_control_id is null then
    raise exception 'Franco corrected operation was not committed';
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id, 'ninja_operation_batches', target_batch_id,
    'franco_preposition_fee_repaired',
    jsonb_build_object(
      'owner_user_id', franco_id,
      'connector_id', target_connector_id,
      'period_id', target_period_id,
      'daily_control_id', new_control_id,
      'opening_balance_cents', 176355,
      'closing_balance_cents', 163781,
      'operating_result_cents', -12574,
      'preposition_fee_cents', 287,
      'deduplicated_prop_session_id', 2637840,
      'opening_event_id', corrected_opening_event_id
    ),
    'Comisión anterior a la posición incorporada al resultado real de la operación'
  );
end;
$repair$;

commit;
