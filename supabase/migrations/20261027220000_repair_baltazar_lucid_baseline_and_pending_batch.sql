-- Repara el punto operativo omitido de las cinco cuentas Lucid de Baltazar
-- y confirma el lote del 27/10 una vez verificada la continuidad exacta del
-- saldo broker. Las cuentas comenzaron Primera vuelta / Dia 1 y ya tenian un
-- trade Funded conciliado; el lote pendiente corresponde al siguiente trade.

begin;

do $repair$
declare
  baltazar_id constant uuid := '42c42ea2-c9a9-41c6-8604-5804982c1f50';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_connector_id constant uuid := '4d539f74-3b6d-48c9-85a1-3349548db500';
  target_period_id constant uuid := 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb';
  target_batch_id constant uuid := '9df94f6b-5952-4066-b4a9-38acfb1c968f';
  committed_control_id uuid;
  changed_count integer;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'periods'
      and events.entity_id = target_period_id
      and events.action = 'baltazar_lucid_baseline_and_pending_batch_repaired'
  ) then
    return;
  end if;

  if (select count(*) from public.ninja_account_links links
      where links.connector_id = target_connector_id
        and links.closed_at is null
        and links.phase = 'Funded'
        and links.external_account_name in (
          'LFF05096653910001',
          'LFF05096653910002',
          'LFF05096653910003',
          'LFF05096653910004',
          'LFF05096653910005'
        )) <> 5 then
    raise exception 'Expected five active Baltazar Lucid funded links';
  end if;

  if not exists (
    select 1 from public.daily_controls controls
    where controls.period_id = target_period_id
      and controls.control_number = 3
      and controls.kind = 'deposit'
      and controls.balance_before_cents = 403454
      and controls.balance_after_cents = 663754
  ) then
    raise exception 'Baltazar broker deposit continuity changed; aborting controlled repair';
  end if;

  if not exists (
    select 1
    from public.ninja_operation_batches batches
    join public.ninja_operation_probe_sessions sessions
      on sessions.id = batches.broker_session_id
    where batches.id = target_batch_id
      and batches.connector_id = target_connector_id
      and batches.accounting_period_id = target_period_id
      and batches.status = 'ready'
      and batches.accounting_status = 'blocked'
      and batches.broker_result_cents = 232400
      and sessions.opening_balance = 6637.54
      and sessions.closing_balance = 8961.54
      and sessions.result = 2324
  ) then
    raise exception 'Expected Baltazar pending batch or broker balances changed';
  end if;

  if (select count(*) from public.ninja_operation_batch_members members
      where members.batch_id = target_batch_id
        and members.role = 'prop'
        and members.account_id is not null
        and members.allocated_broker_result_cents = 46480) <> 5 then
    raise exception 'Expected five equally allocated Baltazar prop members';
  end if;

  update public.ninja_account_links links
  set accounting_phase = 'Primera vuelta', completed_trade_days = 1
  where links.connector_id = target_connector_id
    and links.closed_at is null
    and links.phase = 'Funded'
    and links.external_account_name in (
      'LFF05096653910001',
      'LFF05096653910002',
      'LFF05096653910003',
      'LFF05096653910004',
      'LFF05096653910005'
    );
  get diagnostics changed_count = row_count;
  if changed_count <> 5 then
    raise exception 'Expected to update five Baltazar Lucid baselines, found %', changed_count;
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  )
  select admin_id, 'ninja_account_links', links.account_id,
    'detected_account_operational_baseline_repaired',
    jsonb_build_object(
      'connector_id', target_connector_id,
      'external_account_name', links.external_account_name,
      'accounting_phase', links.accounting_phase,
      'completed_trade_days', links.completed_trade_days,
      'next_trade_day_before_existing_entries', links.completed_trade_days + 1
    ),
    'Vuelta y dia iniciales informados por Mauricio para las cinco cuentas Lucid de Baltazar'
  from public.ninja_account_links links
  where links.connector_id = target_connector_id
    and links.closed_at is null
    and links.external_account_name like 'LFF0509665391%';

  update public.ninja_operation_batches batches
  set accounting_mode = 'shadow',
      accounting_status = 'shadow_ready',
      accounting_blocking_reason = null,
      accounting_period_id = target_period_id,
      accounting_company_id = '31f7ac9f-21c4-4322-b188-a6af31d882bd',
      accounting_phase = 'Primera vuelta',
      operated_on = '2026-10-27',
      updated_at = now()
  where batches.id = target_batch_id
    and batches.connector_id = target_connector_id
    and batches.accounting_status = 'blocked';
  if not found then raise exception 'Baltazar pending batch was not updated'; end if;

  perform set_config('request.jwt.claim.sub', baltazar_id::text, true);
  committed_control_id := public.commit_ninja_automatic_operation_batch(target_batch_id);
  if committed_control_id is null then
    raise exception 'Baltazar pending batch was not committed';
  end if;

  if not exists (
    select 1 from public.daily_controls controls
    where controls.id = committed_control_id
      and controls.period_id = target_period_id
      and controls.control_number = 4
      and controls.operated_on = '2026-10-27'
      and controls.phase = 'Primera vuelta'
      and controls.balance_before_cents = 663754
      and controls.balance_after_cents = 896154
      and controls.operating_result_cents = 232400
  ) then
    raise exception 'Baltazar committed control does not preserve the verified broker continuity';
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id, 'periods', target_period_id,
    'baltazar_lucid_baseline_and_pending_batch_repaired',
    jsonb_build_object(
      'connector_id', target_connector_id,
      'baseline', jsonb_build_object('phase', 'Primera vuelta', 'completed_trade_days', 1),
      'committed_batch_id', target_batch_id,
      'daily_control_id', committed_control_id,
      'broker_result_cents', 232400,
      'final_broker_balance_cents', 896154,
      'prop_accounts', 5
    ),
    'Reparacion controlada solicitada por Mauricio conservando los controles anteriores y el deposito del 27/10'
  );
end;
$repair$;

commit;
