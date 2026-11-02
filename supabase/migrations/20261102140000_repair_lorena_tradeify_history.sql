-- Recupera las cinco operaciones de Segunda vuelta de Lorena que quedaron
-- fuera de la contabilidad porque sus cuentas fueron registradas antes de que
-- vuelta y día fueran obligatorios. La continuidad broker fue confirmada por
-- Mauricio y el invertido final confirmado es 728,64 por cuenta, incluyendo
-- los 219,81 registrados al dar de alta cada cuenta.

begin;

do $repair$
declare
  lore_id constant uuid := '2b0f63da-bf32-41ee-86c2-98fb5dbe583b';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_period_id constant uuid := '6325a8a9-1ac4-469b-84fa-08e040faf81b';
  target_connector_id constant uuid := 'a697d39d-a2c6-439f-aa8a-fc9075da40e5';
  target_company_id constant uuid := '218dffdf-163a-4f3e-86ce-82ebf085f6b7';
  account_ids constant uuid[] := array[
    'f808b960-3215-46e3-9368-cef648c6bf58'::uuid,
    '4e82e34b-1116-4eb0-b3c6-2eb439f67fac'::uuid,
    'e22479fa-8a12-4bcf-bf4e-4b707c8e8ad6'::uuid,
    'f7ac2a26-ba88-441d-8644-8bae790042a0'::uuid,
    'a19fad2a-d84d-4957-95b7-78dbb836cc0b'::uuid
  ];
  leader_id constant uuid := 'f808b960-3215-46e3-9368-cef648c6bf58';
  changed_count integer;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'periods'
      and events.entity_id = target_period_id
      and events.action = 'lorena_tradeify_history_recovered'
  ) then
    return;
  end if;

  if not exists (
    select 1 from public.period_opening_snapshots snapshots
    where snapshots.period_id = target_period_id
      and snapshots.start_mode = 'zero'
      and snapshots.cutover_date = date '2026-10-27'
      and snapshots.broker_balance_cents = 885512
      and snapshots.contributed_capital_cents = 885512
      and snapshots.revision_number = 2
  ) then
    raise exception 'Lorena opening changed; aborting controlled recovery';
  end if;

  if exists (
    select 1 from public.daily_controls controls
    where controls.period_id = target_period_id
  ) then
    raise exception 'Lorena already has daily controls; recovery requires review';
  end if;

  if exists (
    select 1 from public.funding_withdrawals withdrawals
    where withdrawals.period_id = target_period_id
  ) then
    raise exception 'Lorena already has payouts; recovery requires review';
  end if;

  if (
    select count(*)
    from public.ninja_account_links links
    join public.accounts accounts on accounts.id = links.account_id
    join public.purchases purchases on purchases.account_id = links.account_id
    where links.connector_id = target_connector_id
      and links.account_id = any(account_ids)
      and links.closed_at is null
      and links.phase = 'Funded'
      and links.accounting_phase is null
      and links.completed_trade_days is null
      and accounts.period_id = target_period_id
      and accounts.company_id = target_company_id
      and accounts.state = 'live'
      and purchases.price_cents = 21981
  ) <> 5 then
    raise exception 'Expected five legacy Lorena Tradeify accounts without baseline';
  end if;

  update public.period_opening_snapshots snapshots
  set cutover_date = date '2026-10-26',
      broker_balance_cents = 1054660,
      contributed_capital_cents = 1054660,
      revision_number = 3,
      updated_by = admin_id,
      updated_at = now()
  where snapshots.period_id = target_period_id;
  if not found then raise exception 'Lorena opening was not updated'; end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
  ) values (
    admin_id, 'period_opening_snapshots', target_period_id,
    'opening_corrected_for_historical_recovery',
    jsonb_build_object(
      'cutover_date', '2026-10-27',
      'broker_balance_cents', 885512,
      'contributed_capital_cents', 885512,
      'revision_number', 2
    ),
    jsonb_build_object(
      'cutover_date', '2026-10-26',
      'broker_balance_cents', 1054660,
      'contributed_capital_cents', 1054660,
      'revision_number', 3
    ),
    'Se recupera el saldo inicial confirmado antes de la primera operación omitida del 26/10'
  );

  -- Cada fecha se divide en la cobertura atribuible a las cinco cuentas y el
  -- resultado broker restante. Ambos renglones conservan exactamente el saldo
  -- antes/después confirmado, sin cargar el remanente a las cuentas.
  insert into public.daily_controls(
    period_id, control_number, operated_on, kind,
    balance_before_cents, balance_after_cents, operating_result_cents,
    company_id, leader_account_id, phase, observations, source,
    confirmation_key, created_by, updated_by
  ) values
    (target_period_id, 1, date '2026-10-26', 'balance_update',
      1054660, 951560, -103100, target_company_id, leader_id, 'Segunda vuelta',
      'Recuperación auditada de cinco cuentas Tradeify; porción atribuible confirmada por flotante final.',
      'manual', '10e00000-0000-4000-8000-000000000001', lore_id, admin_id),
    (target_period_id, 3, date '2026-10-27', 'balance_update',
      885512, 881983, -3529, target_company_id, leader_id, 'Segunda vuelta',
      'Recuperación auditada de cinco cuentas Tradeify; porción atribuible confirmada por flotante final.',
      'manual', '10e00000-0000-4000-8000-000000000003', lore_id, admin_id),
    (target_period_id, 5, date '2026-10-28', 'balance_update',
      879722, 835656, -44066, target_company_id, leader_id, 'Segunda vuelta',
      'Recuperación auditada de cinco cuentas Tradeify; porción atribuible confirmada por flotante final.',
      'manual', '10e00000-0000-4000-8000-000000000005', lore_id, admin_id),
    (target_period_id, 7, date '2026-10-29', 'balance_update',
      807426, 779512, -27914, target_company_id, leader_id, 'Segunda vuelta',
      'Recuperación auditada de cinco cuentas Tradeify; porción atribuible confirmada por flotante final.',
      'manual', '10e00000-0000-4000-8000-000000000007', lore_id, admin_id),
    (target_period_id, 9, date '2026-10-30', 'balance_update',
      761630, 685824, -75806, target_company_id, leader_id, 'Segunda vuelta',
      'Recuperación auditada de cinco cuentas Tradeify; porción atribuible confirmada por flotante final.',
      'manual', '10e00000-0000-4000-8000-000000000009', lore_id, admin_id);

  insert into public.daily_controls(
    period_id, control_number, operated_on, kind,
    balance_before_cents, balance_after_cents, operating_result_cents,
    observations, source, source_event_key, received_balance_cents,
    confirmation_key, created_by, updated_by, is_uncovered
  ) values
    (target_period_id, 2, date '2026-10-26', 'balance_update',
      951560, 885512, -66048,
      'Diferencia broker no atribuida a las cinco Tradeify en la recuperación histórica.',
      'ninjatrader', 'lore-recovery:2026-10-26:uncovered', 885512,
      '10e00000-0000-4000-8000-000000000002', lore_id, admin_id, true),
    (target_period_id, 4, date '2026-10-27', 'balance_update',
      881983, 879722, -2261,
      'Diferencia broker no atribuida a las cinco Tradeify en la recuperación histórica.',
      'ninjatrader', 'lore-recovery:2026-10-27:uncovered', 879722,
      '10e00000-0000-4000-8000-000000000004', lore_id, admin_id, true),
    (target_period_id, 6, date '2026-10-28', 'balance_update',
      835656, 807426, -28230,
      'Diferencia broker no atribuida a las cinco Tradeify en la recuperación histórica.',
      'ninjatrader', 'lore-recovery:2026-10-28:uncovered', 807426,
      '10e00000-0000-4000-8000-000000000006', lore_id, admin_id, true),
    (target_period_id, 8, date '2026-10-29', 'balance_update',
      779512, 761630, -17882,
      'Diferencia broker no atribuida a las cinco Tradeify en la recuperación histórica.',
      'ninjatrader', 'lore-recovery:2026-10-29:uncovered', 761630,
      '10e00000-0000-4000-8000-000000000008', lore_id, admin_id, true),
    (target_period_id, 10, date '2026-10-30', 'balance_update',
      685824, 637260, -48564,
      'Diferencia broker no atribuida a las cinco Tradeify en la recuperación histórica.',
      'ninjatrader', 'lore-recovery:2026-10-30:uncovered', 637260,
      '10e00000-0000-4000-8000-000000000010', lore_id, admin_id, true);

  insert into public.daily_control_participants(
    daily_control_id, period_id, account_id, role, allocated_result_cents
  )
  select controls.id, target_period_id, participants.account_id,
    case when participants.ordinality = 1
      then 'leader'::public.daily_control_participant_role
      else 'replica'::public.daily_control_participant_role end,
    case controls.control_number
      when 1 then -20620
      when 3 then case when participants.ordinality <= 4 then -706 else -705 end
      when 5 then case when participants.ordinality = 1 then -8814 else -8813 end
      when 7 then case when participants.ordinality = 1 then -5582 else -5583 end
      when 9 then case when participants.ordinality = 5 then -15162 else -15161 end
    end
  from public.daily_controls controls
  cross join unnest(account_ids) with ordinality participants(account_id, ordinality)
  where controls.period_id = target_period_id
    and controls.control_number in (1, 3, 5, 7, 9);

  insert into public.operation_entries(
    period_id, daily_control_id, account_id, operated_on, phase,
    participant_role, destination, magnitude_cents, created_by, updated_by
  )
  select participants.period_id, participants.daily_control_id,
    participants.account_id, controls.operated_on, controls.phase,
    participants.role, 'NETO BROKER -'::public.broker_result_destination,
    abs(participants.allocated_result_cents), lore_id, admin_id
  from public.daily_control_participants participants
  join public.daily_controls controls on controls.id = participants.daily_control_id
  where controls.period_id = target_period_id
    and controls.control_number in (1, 3, 5, 7, 9);

  update public.ninja_account_links links
  set accounting_phase = 'Segunda vuelta', completed_trade_days = 0
  where links.connector_id = target_connector_id
    and links.account_id = any(account_ids)
    and links.closed_at is null;
  get diagnostics changed_count = row_count;
  if changed_count <> 5 then
    raise exception 'Expected five Lorena operational baselines, found %', changed_count;
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
      'completed_trade_days_at_registration', links.completed_trade_days,
      'recovered_trade_count', 5,
      'next_action', 'Registrar payout de Segunda vuelta'
    ),
    'Cinco operaciones recuperadas; el payout permanece a cargo de Lorena'
  from public.ninja_account_links links
  where links.connector_id = target_connector_id
    and links.account_id = any(account_ids)
    and links.closed_at is null;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  )
  select admin_id, 'daily_controls', controls.id,
    case when controls.is_uncovered
      then 'historical_uncovered_result_recovered'
      else 'daily_control_recovered' end,
    jsonb_build_object(
      'period_id', controls.period_id,
      'control_number', controls.control_number,
      'operated_on', controls.operated_on,
      'balance_before_cents', controls.balance_before_cents,
      'balance_after_cents', controls.balance_after_cents,
      'operating_result_cents', controls.operating_result_cents,
      'is_uncovered', controls.is_uncovered
    ),
    'Reconstrucción desde saldos broker confirmados y flotante final confirmado por Mauricio'
  from public.daily_controls controls
  where controls.period_id = target_period_id;

  if (select count(*) from public.daily_controls controls
      where controls.period_id = target_period_id) <> 10
    or (select count(*) from public.operation_entries entries
        where entries.period_id = target_period_id) <> 25
    or (select count(*) from public.daily_control_participants participants
        where participants.period_id = target_period_id) <> 25
    or (select sum(controls.operating_result_cents) from public.daily_controls controls
        where controls.period_id = target_period_id) <> -417400
    or (select sum(controls.operating_result_cents) from public.daily_controls controls
        where controls.period_id = target_period_id and controls.is_uncovered) <> -162985
    or (select max(controls.balance_after_cents) filter (where controls.control_number = 10)
        from public.daily_controls controls where controls.period_id = target_period_id) <> 637260
    or exists (
      select 1
      from unnest(account_ids) as target(account_id)
      where (
        select purchases.price_cents + coalesce(sum(entries.magnitude_cents), 0)
        from public.purchases purchases
        left join public.operation_entries entries on entries.account_id = purchases.account_id
        where purchases.account_id = target.account_id
        group by purchases.price_cents
      ) <> 72864
    )
  then
    raise exception 'Lorena recovery integrity check failed';
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id, 'periods', target_period_id, 'lorena_tradeify_history_recovered',
    jsonb_build_object(
      'connector_id', target_connector_id,
      'trade_dates', jsonb_build_array(
        '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'
      ),
      'phase', 'Segunda vuelta',
      'completed_trade_days', 5,
      'final_broker_balance_cents', 637260,
      'broker_result_cents', -417400,
      'allocated_result_cents', -254415,
      'uncovered_result_cents', -162985,
      'purchase_cost_per_account_cents', 21981,
      'final_open_investment_per_account_cents', 72864,
      'payout_created', false
    ),
    'Recuperación solicitada por Mauricio; Lore registrará el payout después de validar el historial'
  );
end;
$repair$;

commit;
