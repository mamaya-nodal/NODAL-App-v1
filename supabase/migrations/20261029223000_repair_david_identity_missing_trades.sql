-- Recupera las cinco coberturas de David Zabaleta que no fueron transmitidas
-- por el conector v0.15 de su identidad. La evidencia fue informada por el
-- administrador y se registra como control manual auditado: no se inventan
-- sesiones ni eventos técnicos de NinjaTrader.

begin;

do $repair$
declare
  david_id constant uuid := 'b1afb804-fb3f-4424-b9ab-5e0e0b0ec887';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_period_id constant uuid := 'f028cd3d-aef3-45b5-a088-fa92e54c70e9';
  target_connector_id constant uuid := '382123f6-6164-47c1-9dc9-1b7c2a4a520e';
  target_company_id constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  leader_id constant uuid := '3971a4a0-eada-4a13-868d-3f459cc8b14b';
  replica_ids constant uuid[] := array[
    'cd5d41dc-9189-479b-82e1-839e3a30c105'::uuid,
    '4539db74-2d0e-48b9-808a-34aaf924cce7'::uuid,
    '2e34f96d-9610-4ba6-8f73-8ebfab57dfa2'::uuid,
    '48154c43-23d5-4992-abcd-2ece16236c65'::uuid
  ];
  all_account_ids constant uuid[] := array_prepend(leader_id, replica_ids);
  trade1_control_id uuid;
  trade2_control_id uuid;
  trade3_control_id uuid;
  trade4_control_id uuid;
  trade5_control_id uuid;
  changed_count integer;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'periods'
      and events.entity_id = target_period_id
      and events.action = 'david_identity_missing_trades_recovered'
  ) then
    return;
  end if;

  if (select snapshots.broker_balance_cents
      from public.period_opening_snapshots snapshots
      where snapshots.period_id = target_period_id) is distinct from 1093062 then
    raise exception 'David opening broker balance changed; aborting controlled recovery';
  end if;

  if exists (select 1 from public.daily_controls controls where controls.period_id = target_period_id) then
    raise exception 'David already has daily controls; historical recovery requires review';
  end if;

  if (select count(*) from public.ninja_account_links links
      join public.accounts accounts on accounts.id = links.account_id
      join public.purchases purchases on purchases.account_id = accounts.id
      where links.connector_id = target_connector_id
        and links.closed_at is null
        and links.account_id = any(all_account_ids)
        and links.phase = 'Funded'
        and accounts.period_id = target_period_id
        and accounts.company_id = target_company_id
        and accounts.state = 'live'
        and purchases.price_cents = 27230) <> 5 then
    raise exception 'Expected five active David LFF accounts with their original purchase cost';
  end if;

  insert into public.daily_controls(
    period_id, control_number, operated_on, kind,
    balance_before_cents, balance_after_cents, operating_result_cents,
    company_id, leader_account_id, phase, observations, source,
    confirmation_key, created_by, updated_by
  ) values
    (target_period_id, 1, date '2026-10-24', 'balance_update',
      1093062, 1035022, -58040, target_company_id, leader_id, 'Segunda vuelta',
      'Recuperacion auditada: trade 1 omitido por conector de Identidad v0.15', 'manual',
      'd4110000-0000-4000-8000-000000000001', david_id, admin_id),
    (target_period_id, 2, date '2026-10-26', 'balance_update',
      1035022, 1016872, -18150, target_company_id, leader_id, 'Segunda vuelta',
      'Recuperacion auditada: trade 2 omitido por conector de Identidad v0.15', 'manual',
      'd4110000-0000-4000-8000-000000000002', david_id, admin_id),
    (target_period_id, 3, date '2026-10-27', 'balance_update',
      1016872, 989652, -27220, target_company_id, leader_id, 'Segunda vuelta',
      'Recuperacion auditada: trade 3 omitido por conector de Identidad v0.15', 'manual',
      'd4110000-0000-4000-8000-000000000003', david_id, admin_id),
    (target_period_id, 4, date '2026-10-28', 'balance_update',
      989652, 957932, -31720, target_company_id, leader_id, 'Segunda vuelta',
      'Recuperacion auditada: trade 4 omitido por conector de Identidad v0.15', 'manual',
      'd4110000-0000-4000-8000-000000000004', david_id, admin_id),
    (target_period_id, 5, date '2026-10-29', 'balance_update',
      957932, 986952, 29020, target_company_id, leader_id, 'Segunda vuelta',
      'Recuperacion auditada: trade 5 omitido por conector de Identidad v0.15', 'manual',
      'd4110000-0000-4000-8000-000000000005', david_id, admin_id);

  select id into trade1_control_id from public.daily_controls
    where created_by = david_id and confirmation_key = 'd4110000-0000-4000-8000-000000000001';
  select id into trade2_control_id from public.daily_controls
    where created_by = david_id and confirmation_key = 'd4110000-0000-4000-8000-000000000002';
  select id into trade3_control_id from public.daily_controls
    where created_by = david_id and confirmation_key = 'd4110000-0000-4000-8000-000000000003';
  select id into trade4_control_id from public.daily_controls
    where created_by = david_id and confirmation_key = 'd4110000-0000-4000-8000-000000000004';
  select id into trade5_control_id from public.daily_controls
    where created_by = david_id and confirmation_key = 'd4110000-0000-4000-8000-000000000005';

  -- El saldo broker perdió 580,40 en el primer trade, pero el costo asignable
  -- confirmado fue 580,38. Los dos centavos quedan como redondeo del control.
  insert into public.daily_control_participants(
    daily_control_id, period_id, account_id, role, allocated_result_cents
  )
  select controls.id, target_period_id, participants.account_id,
    case when participants.ordinality = 1 then 'leader'::public.daily_control_participant_role
      else 'replica'::public.daily_control_participant_role end,
    case controls.control_number
      when 1 then case when participants.ordinality <= 3 then -11608 else -11607 end
      when 2 then -3630
      when 3 then -5444
      when 4 then -6344
      when 5 then 5804
    end
  from public.daily_controls controls
  cross join unnest(all_account_ids) with ordinality participants(account_id, ordinality)
  where controls.id in (
    trade1_control_id, trade2_control_id, trade3_control_id,
    trade4_control_id, trade5_control_id
  );

  insert into public.operation_entries(
    period_id, daily_control_id, account_id, operated_on, phase,
    participant_role, destination, magnitude_cents, created_by, updated_by
  )
  select participants.period_id, participants.daily_control_id, participants.account_id,
    controls.operated_on, controls.phase, participants.role,
    case when participants.allocated_result_cents > 0 then 'NETO BROKER +'::public.broker_result_destination
      when participants.allocated_result_cents < 0 then 'NETO BROKER -'::public.broker_result_destination
      else 'NONE'::public.broker_result_destination end,
    abs(participants.allocated_result_cents), david_id, admin_id
  from public.daily_control_participants participants
  join public.daily_controls controls on controls.id = participants.daily_control_id
  where participants.daily_control_id in (
    trade1_control_id, trade2_control_id, trade3_control_id,
    trade4_control_id, trade5_control_id
  );

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  )
  select admin_id, 'daily_controls', controls.id, 'daily_control_recovered',
    jsonb_build_object(
      'period_id', controls.period_id,
      'control_number', controls.control_number,
      'operated_on', controls.operated_on,
      'balance_before_cents', controls.balance_before_cents,
      'balance_after_cents', controls.balance_after_cents,
      'operating_result_cents', controls.operating_result_cents,
      'participant_count', 5,
      'phase', controls.phase,
      'source', controls.source
    ),
    'Operacion reconstruida desde las anotaciones confirmadas por Mauricio; sin inventar telemetria Ninja'
  from public.daily_controls controls
  where controls.id in (
    trade1_control_id, trade2_control_id, trade3_control_id,
    trade4_control_id, trade5_control_id
  );

  update public.ninja_account_links links
  set accounting_phase = 'Segunda vuelta', completed_trade_days = 0
  where links.connector_id = target_connector_id
    and links.closed_at is null
    and links.account_id = any(all_account_ids);
  get diagnostics changed_count = row_count;
  if changed_count <> 5 then raise exception 'Expected five David operational baselines'; end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  )
  select admin_id, 'ninja_account_links', links.account_id,
    'detected_account_operational_baseline_repaired',
    jsonb_build_object(
      'connector_id', target_connector_id,
      'external_account_name', links.external_account_name,
      'accounting_phase', links.accounting_phase,
      'completed_trade_days_before_recovery', links.completed_trade_days,
      'recovered_trade_count', 5,
      'next_trade_day', 6
    ),
    'Cinco trades de Segunda vuelta recuperados desde las anotaciones confirmadas por Mauricio'
  from public.ninja_account_links links
  where links.connector_id = target_connector_id
    and links.closed_at is null
    and links.account_id = any(all_account_ids);

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id, 'daily_controls', trade1_control_id,
    'manual_recovery_rounding_documented',
    jsonb_build_object(
      'broker_result_cents', -58040,
      'allocated_result_cents', -58038,
      'rounding_difference_cents', -2
    ),
    'Diferencia de dos centavos entre saldo broker observado y costo total confirmado'
  );

  if (select count(*) from public.daily_controls controls
      where controls.id in (trade1_control_id, trade2_control_id, trade3_control_id, trade4_control_id, trade5_control_id)) <> 5
    or (select count(*) from public.operation_entries entries
        where entries.daily_control_id in (trade1_control_id, trade2_control_id, trade3_control_id, trade4_control_id, trade5_control_id)) <> 25
    or (select sum(-participants.allocated_result_cents)
        from public.daily_control_participants participants
        where participants.daily_control_id in (trade1_control_id, trade2_control_id, trade3_control_id, trade4_control_id, trade5_control_id)) <> 106108
  then
    raise exception 'David recovery integrity check failed';
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id, 'periods', target_period_id,
    'david_identity_missing_trades_recovered',
    jsonb_build_object(
      'connector_id', target_connector_id,
      'trade_dates', jsonb_build_array('2026-10-24','2026-10-26','2026-10-27','2026-10-28','2026-10-29'),
      'phase', 'Segunda vuelta',
      'completed_trades', 5,
      'next_trade_day', 6,
      'final_broker_balance_cents', 986952,
      'broker_result_cents', -106110,
      'allocated_result_cents', -106108,
      'purchase_cost_cents', 136150,
      'final_open_investment_cents', 242258
    ),
    'Recuperacion solicitada por Mauricio luego de actualizar el conector de la Identidad a v0.16'
  );
end;
$repair$;

commit;
