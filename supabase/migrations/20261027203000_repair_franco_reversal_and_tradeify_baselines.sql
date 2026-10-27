-- Repara el primer circuito real de Franco Seco con dos evidencias confirmadas:
-- las cinco Tradeify estaban en Primera vuelta / Dia 1 al registrarse y una
-- reversion accidental de broker fue un trade independiente sin cobertura.
-- La correccion conserva el orden exacto del saldo y utiliza los flujos de
-- confirmacion existentes para crear los controles y su auditoria.

begin;

do $repair$
declare
  franco_id constant uuid := 'ca3dca6d-7ff2-4f92-957d-f3cb2c7553bf';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_connector_id constant uuid := '038a26a3-d9e8-44cf-91f9-ddc9054beff5';
  target_period_id constant uuid := 'e6869570-7e74-4a57-927e-40d7261e54ac';
  target_tradeify_company_id constant uuid := '218dffdf-163a-4f3e-86ce-82ebf085f6b7';
  target_lucid_company_id constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  changed_count integer;
  uncovered_control_id uuid;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'periods'
      and events.entity_id = target_period_id
      and events.action = 'franco_reversal_and_tradeify_baselines_repaired'
  ) then
    return;
  end if;

  if (select snapshots.broker_balance_cents
      from public.period_opening_snapshots snapshots
      where snapshots.period_id = target_period_id) is distinct from 186361 then
    raise exception 'Franco opening balance changed; aborting controlled repair';
  end if;
  if exists (select 1 from public.daily_controls controls where controls.period_id = target_period_id) then
    raise exception 'Franco already has daily controls; historical repair requires review';
  end if;

  update public.ninja_account_links links
  set accounting_phase = 'Primera vuelta', completed_trade_days = 1
  where links.connector_id = target_connector_id
    and links.closed_at is null
    and links.external_account_name in (
      'FTDFYSLX50433081206',
      'FTDFYSLX50148277918',
      'FTDFYSLX50413625023',
      'FTDFYSLX50871361650',
      'FTDFYSLX50845192487'
    );
  get diagnostics changed_count = row_count;
  if changed_count <> 5 then
    raise exception 'Expected five active Franco Tradeify links, found %', changed_count;
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
      'next_trade_day', links.completed_trade_days + 1
    ),
    'Vuelta y dia informados por Mauricio para reparar el primer circuito real de Franco'
  from public.ninja_account_links links
  where links.connector_id = target_connector_id
    and links.closed_at is null
    and links.external_account_name like 'FTDFYSLX%';

  update public.ninja_operation_probe_sessions
  set opening_balance = 1863.61, closing_balance = 1827.87, result = -35.74,
      updated_at = now()
  where id = 2509011 and connector_id = target_connector_id and opening_event_id = 772692;

  update public.ninja_operation_probe_sessions
  set opening_balance = 1827.87, closing_balance = 1732.13, result = -95.74,
      flat_at = '2026-10-27T17:11:07.374177+00:00',
      last_event_at = '2026-10-27T17:11:07.374177+00:00',
      execution_count = 2, direction = 'Short', updated_at = now()
  where id = 2510990 and connector_id = target_connector_id and opening_event_id = 774522;

  update public.ninja_operation_probe_sessions
  set opening_balance = 1732.13, closing_balance = 1676.39, result = -55.74,
      execution_count = 2, direction = 'Long', updated_at = now()
  where id = 2512007 and connector_id = target_connector_id and opening_event_id = 775220;

  if (select count(*) from public.ninja_operation_probe_sessions sessions
      where sessions.id in (2509011, 2510990, 2512007)
        and sessions.connector_id = target_connector_id) <> 3 then
    raise exception 'Expected Franco broker sessions are missing';
  end if;

  update public.ninja_operation_batches
  set broker_result_cents = -3574, distributed_cents = -3574,
      rounding_difference_cents = 0, updated_at = now()
  where id = '7f3ba25e-f743-4971-a8bd-819326558e8d'
    and connector_id = target_connector_id and broker_session_id = 2509011;

  update public.ninja_operation_batches
  set broker_result_cents = -9574, distributed_cents = -9574,
      rounding_difference_cents = 0, updated_at = now()
  where id = '970c0640-fb0b-4d51-afb3-839e50fbcb5c'
    and connector_id = target_connector_id and broker_session_id = 2510990;

  update public.ninja_operation_batches
  set broker_result_cents = -5574, distributed_cents = 0,
      rounding_difference_cents = -5574, updated_at = now()
  where id = 'e4df4758-e37c-4656-949e-ec7904250d9c'
    and connector_id = target_connector_id and broker_session_id = 2512007;

  update public.ninja_operation_batch_members
  set allocated_broker_result_cents = -3574
  where batch_id = '7f3ba25e-f743-4971-a8bd-819326558e8d' and role = 'prop';
  update public.ninja_operation_batch_members
  set allocated_broker_result_cents = -9574
  where batch_id = '970c0640-fb0b-4d51-afb3-839e50fbcb5c' and role = 'prop';

  update public.ninja_operation_batches batches
  set accounting_mode = 'shadow', accounting_status = 'shadow_ready',
      accounting_blocking_reason = null, accounting_period_id = target_period_id,
      accounting_company_id = target_tradeify_company_id,
      accounting_phase = 'Primera vuelta', operated_on = '2026-10-27',
      updated_at = now()
  where batches.id in (
    '7f3ba25e-f743-4971-a8bd-819326558e8d',
    '970c0640-fb0b-4d51-afb3-839e50fbcb5c',
    '52aa4530-e287-4c0e-a9f3-89cc22a857ef',
    'abef51cb-910c-46f0-836e-47ddf2550359',
    '2cc9e5a3-56ad-4eac-8ab2-013da698e193'
  ) and batches.connector_id = target_connector_id and batches.status = 'ready';
  get diagnostics changed_count = row_count;
  if changed_count <> 5 then
    raise exception 'Expected five ready Franco Tradeify batches, found %', changed_count;
  end if;

  update public.ninja_operation_batches batches
  set accounting_mode = 'shadow', accounting_status = 'shadow_ready',
      accounting_blocking_reason = null, accounting_period_id = target_period_id,
      accounting_company_id = target_lucid_company_id,
      accounting_phase = 'Cuarta vuelta', operated_on = '2026-10-27',
      updated_at = now()
  where batches.id = '84d8e50c-6b5f-49f2-b4ca-ea6dc98e918b'
    and batches.connector_id = target_connector_id and batches.status = 'ready';
  if not found then raise exception 'Expected Franco Lucid batch is missing'; end if;

  perform public.commit_ninja_automatic_operation_batch(
    '7f3ba25e-f743-4971-a8bd-819326558e8d'
  );
  perform public.commit_ninja_automatic_operation_batch(
    '970c0640-fb0b-4d51-afb3-839e50fbcb5c'
  );

  perform set_config('request.jwt.claim.sub', franco_id::text, true);
  uncovered_control_id := public.confirm_ninja_uncovered_trade(
    'e4df4758-e37c-4656-949e-ec7904250d9c', -5574, true
  );
  if uncovered_control_id is null then
    raise exception 'Franco uncovered trade was not confirmed';
  end if;

  perform public.commit_ninja_automatic_operation_batch(
    '52aa4530-e287-4c0e-a9f3-89cc22a857ef'
  );
  perform public.commit_ninja_automatic_operation_batch(
    'abef51cb-910c-46f0-836e-47ddf2550359'
  );
  perform public.commit_ninja_automatic_operation_batch(
    '2cc9e5a3-56ad-4eac-8ab2-013da698e193'
  );
  perform public.commit_ninja_automatic_operation_batch(
    '84d8e50c-6b5f-49f2-b4ca-ea6dc98e918b'
  );

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id, 'periods', target_period_id,
    'franco_reversal_and_tradeify_baselines_repaired',
    jsonb_build_object(
      'connector_id', target_connector_id,
      'tradeify_baseline', jsonb_build_object('phase', 'Primera vuelta', 'completed_trade_days', 1),
      'covered_trade_result_cents', -9574,
      'uncovered_trade_result_cents', -5574,
      'final_broker_balance_cents', 133065,
      'daily_controls_created', 7
    ),
    'Reparacion controlada solicitada por Mauricio con evidencia de ejecuciones Ninja y saldo continuo'
  );
end;
$repair$;

commit;
