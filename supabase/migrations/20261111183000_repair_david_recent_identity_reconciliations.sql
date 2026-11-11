-- Reconstruye cronologicamente la contabilidad reciente de David Zabaleta.
-- Los conectores de sus identidades conservaron inventarios y saldos broker,
-- pero no emitieron ejecuciones. Tres operaciones del conector personal si
-- formaron lotes; quedaron bloqueadas por la diferencia acumulada anterior.

begin;

create schema if not exists private_david_recent_repair_20261111;
revoke all on schema private_david_recent_repair_20261111 from public, anon, authenticated;

create table if not exists private_david_recent_repair_20261111.daily_controls as
select * from public.daily_controls
where period_id = 'f028cd3d-aef3-45b5-a088-fa92e54c70e9'::uuid;

create table if not exists private_david_recent_repair_20261111.daily_control_participants as
select participants.* from public.daily_control_participants participants
where participants.period_id = 'f028cd3d-aef3-45b5-a088-fa92e54c70e9'::uuid;

create table if not exists private_david_recent_repair_20261111.operation_entries as
select * from public.operation_entries
where period_id = 'f028cd3d-aef3-45b5-a088-fa92e54c70e9'::uuid;

create table if not exists private_david_recent_repair_20261111.accounts as
select accounts.* from public.accounts accounts
join public.ninja_account_links links on links.account_id = accounts.id
where links.connector_id = any(array[
  '2f930da1-480c-46e9-a435-b2d5e1c5a2ad'::uuid,
  '382123f6-6164-47c1-9dc9-1b7c2a4a520e'::uuid,
  '1fe77d78-f56d-493d-9b41-89ef51838d01'::uuid,
  '2d0b2a67-4861-4409-9393-825360da285f'::uuid
]);

create table if not exists private_david_recent_repair_20261111.ninja_account_links as
select * from public.ninja_account_links
where connector_id = any(array[
  '2f930da1-480c-46e9-a435-b2d5e1c5a2ad'::uuid,
  '382123f6-6164-47c1-9dc9-1b7c2a4a520e'::uuid,
  '1fe77d78-f56d-493d-9b41-89ef51838d01'::uuid,
  '2d0b2a67-4861-4409-9393-825360da285f'::uuid
]);

create table if not exists private_david_recent_repair_20261111.ninja_operation_batches as
select * from public.ninja_operation_batches
where id = any(array[
  '36a8ea8f-d0c6-411f-8bf2-bdf896f4e66c'::uuid,
  '058e8540-995c-4b4b-9ba0-d451bb8d5c0c'::uuid,
  'acdd5108-8261-4676-b8ab-581771eb2026'::uuid
]);

create table if not exists private_david_recent_repair_20261111.ninja_operation_batch_members as
select * from public.ninja_operation_batch_members
where batch_id = any(array[
  '36a8ea8f-d0c6-411f-8bf2-bdf896f4e66c'::uuid,
  '058e8540-995c-4b4b-9ba0-d451bb8d5c0c'::uuid,
  'acdd5108-8261-4676-b8ab-581771eb2026'::uuid
]);

create table if not exists private_david_recent_repair_20261111.ninja_broker_balance_events as
select * from public.ninja_broker_balance_events
where connector_id = '2f930da1-480c-46e9-a435-b2d5e1c5a2ad'::uuid
  and observed_at >= timestamptz '2026-11-09 14:00:00+00';

create temporary table david_recent_repair_plan (
  sequence_number integer primary key,
  operated_on date not null,
  phase public.operation_phase not null,
  balance_before_cents bigint not null,
  balance_after_cents bigint not null,
  operating_result_cents bigint not null,
  source_event_key text not null unique,
  observations text not null,
  account_ids uuid[] not null,
  allocations bigint[] not null,
  batch_id uuid
) on commit drop;

do $repair$
declare
  david_id constant uuid := 'b1afb804-fb3f-4424-b9ab-5e0e0b0ec887';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_period_id constant uuid := 'f028cd3d-aef3-45b5-a088-fa92e54c70e9';
  lucid_company_id constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  personal_connector_id constant uuid := '2f930da1-480c-46e9-a435-b2d5e1c5a2ad';
  jhordan_connector_id constant uuid := '382123f6-6164-47c1-9dc9-1b7c2a4a520e';
  ramses_connector_id constant uuid := '1fe77d78-f56d-493d-9b41-89ef51838d01';
  sebastian_connector_id constant uuid := '2d0b2a67-4861-4409-9393-825360da285f';
  jhordan_ids uuid[];
  personal_ids uuid[];
  ramses_ids uuid[];
  sebastian_ids uuid[];
  repaired_control_id uuid;
  plan_row record;
  changed_count integer;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'periods'
      and events.entity_id = target_period_id
      and events.action = 'david_recent_identity_reconciliation_chain_repaired'
  ) then return; end if;

  if (select count(*) from public.daily_controls where period_id = target_period_id) <> 5
    or not exists (
      select 1 from public.daily_controls
      where period_id = target_period_id and control_number = 5
        and balance_after_cents = 986952
    )
  then raise exception 'David control chain changed; aborting recent reconstruction'; end if;

  select array_agg(links.account_id order by links.external_account_name)
    into jhordan_ids
  from public.ninja_account_links links
  where links.connector_id = jhordan_connector_id
    and links.external_account_name like 'LFF0509576155000%';

  select array_agg(links.account_id order by links.external_account_name)
    into personal_ids
  from public.ninja_account_links links
  where links.connector_id = personal_connector_id
    and links.external_account_name like 'LFE050913723200%';

  select array_agg(links.account_id order by links.external_account_name)
    into ramses_ids
  from public.ninja_account_links links
  where links.connector_id = ramses_connector_id
    and links.external_account_name like 'LFE050989912100%';

  select array_agg(links.account_id order by links.external_account_name)
    into sebastian_ids
  from public.ninja_account_links links
  where links.connector_id = sebastian_connector_id
    and links.external_account_name like 'LFE050929582800%';

  if cardinality(jhordan_ids) <> 5 or cardinality(personal_ids) <> 5
    or cardinality(ramses_ids) <> 5 or cardinality(sebastian_ids) <> 5
  then raise exception 'Expected five linked accounts for each David route'; end if;

  if exists (
    select 1 from public.accounts accounts
    where accounts.id = any(jhordan_ids || personal_ids || ramses_ids || sebastian_ids)
      and (accounts.period_id <> target_period_id or accounts.company_id <> lucid_company_id)
  ) then raise exception 'David account scope changed; aborting reconstruction'; end if;

  -- La suma de esta secuencia lleva exactamente el saldo contable de 9.869,52
  -- al saldo broker observado de 8.743,66 sin forzar diferencias.
  insert into david_recent_repair_plan values
    (1, date '2026-11-03', 'Tercera vuelta', 986952, 881804, -105148,
      'inventory-recovery:david:jhordan:2026-11-03',
      'Recuperación auditada desde inventarios de la Identidad Jhordan; el conector no emitió ejecuciones.',
      jhordan_ids, array[-21030,-21030,-21030,-21029,-21029]::bigint[], null),
    (2, date '2026-11-04', 'Tercera vuelta', 881804, 850156, -31648,
      'inventory-recovery:david:jhordan:2026-11-04',
      'Recuperación auditada desde inventarios de la Identidad Jhordan; el conector no emitió ejecuciones.',
      jhordan_ids, array[-6330,-6330,-6330,-6329,-6329]::bigint[], null),
    (3, date '2026-11-05', 'Tercera vuelta', 850156, 823508, -26648,
      'inventory-recovery:david:jhordan:2026-11-05',
      'Recuperación auditada desde inventarios de la Identidad Jhordan; el conector no emitió ejecuciones.',
      jhordan_ids, array[-5330,-5330,-5330,-5329,-5329]::bigint[], null),
    (4, date '2026-11-06', 'Tercera vuelta', 823508, 782860, -40648,
      'inventory-recovery:david:jhordan:2026-11-06',
      'Recuperación auditada desde inventarios de la Identidad Jhordan; el conector no emitió ejecuciones.',
      jhordan_ids, array[-8130,-8130,-8130,-8129,-8129]::bigint[], null),
    (5, date '2026-11-09', 'Tercera vuelta', 782860, 752064, -30796,
      'inventory-recovery:david:jhordan:2026-11-09',
      'Recuperación auditada desde inventarios de la Identidad Jhordan; el conector no emitió ejecuciones.',
      jhordan_ids, array[-6160,-6159,-6159,-6159,-6159]::bigint[], null),
    (6, date '2026-11-09', 'Evaluacion', 752064, 713374, -38690,
      'ninja-operation:1172350',
      'Conciliación automática recuperada luego de reconstruir las operaciones previas de identidades.',
      personal_ids, array[-7738,-7738,-7738,-7738,-7738]::bigint[],
      '36a8ea8f-d0c6-411f-8bf2-bdf896f4e66c'::uuid),
    (7, date '2026-11-09', 'Evaluacion', 713374, 673934, -39440,
      'inventory-recovery:david:sebastian:2026-11-09',
      'Recuperación auditada desde inventarios de la Identidad Sebastian; el conector no emitió ejecuciones.',
      sebastian_ids, array[-7888,-7888,-7888,-7888,-7888]::bigint[], null),
    (8, date '2026-11-10', 'Cuarta vuelta', 673934, 869786, 195852,
      'inventory-recovery:david:jhordan:2026-11-10',
      'Recuperación auditada desde inventarios de la Identidad Jhordan; el conector no emitió ejecuciones.',
      jhordan_ids, array[39171,39171,39170,39170,39170]::bigint[], null),
    (9, date '2026-11-10', 'Evaluacion', 869786, 928096, 58310,
      'ninja-operation:1206938',
      'Conciliación automática recuperada luego de reconstruir las operaciones previas de identidades.',
      personal_ids, array[11662,11662,11662,11662,11662]::bigint[],
      '058e8540-995c-4b4b-9ba0-d451bb8d5c0c'::uuid),
    (10, date '2026-11-10', 'Evaluacion', 928096, 863306, -64790,
      'inventory-recovery:david:sebastian:2026-11-10',
      'Recuperación auditada desde inventarios de la Identidad Sebastian; el conector no emitió ejecuciones.',
      sebastian_ids, array[-12958,-12958,-12958,-12958,-12958]::bigint[], null),
    (11, date '2026-11-11', 'Evaluacion', 863306, 871566, 8260,
      'ninja-operation:1221867',
      'Conciliación recuperada con las cinco cuentas que existían al abrirse la operación.',
      personal_ids, array[1652,1652,1652,1652,1652]::bigint[],
      'acdd5108-8261-4676-b8ab-581771eb2026'::uuid),
    (12, date '2026-11-11', 'Evaluacion', 871566, 845806, -25760,
      'inventory-recovery:david:sebastian:2026-11-11',
      'Recuperación auditada desde inventarios de la Identidad Sebastian; el conector no emitió ejecuciones.',
      sebastian_ids, array[-5152,-5152,-5152,-5152,-5152]::bigint[], null),
    (13, date '2026-11-11', 'Evaluacion', 845806, 874366, 28560,
      'inventory-recovery:david:ramses:2026-11-11',
      'Recuperación auditada desde inventarios de la Identidad Ramses; el conector no emitió ejecuciones.',
      ramses_ids, array[5712,5712,5712,5712,5712]::bigint[], null);

  if exists (
    select 1 from david_recent_repair_plan
    where cardinality(account_ids) <> 5 or cardinality(allocations) <> 5
      or (select sum(value) from unnest(allocations) value) <> operating_result_cents
  ) or (select min(balance_before_cents) from david_recent_repair_plan where sequence_number = 1) <> 986952
    or (select balance_after_cents from david_recent_repair_plan where sequence_number = 13) <> 874366
  then raise exception 'David reconstruction plan does not reconcile'; end if;

  for plan_row in select * from david_recent_repair_plan order by sequence_number loop
    insert into public.daily_controls(
      period_id, control_number, operated_on, kind,
      balance_before_cents, balance_after_cents, operating_result_cents,
      company_id, leader_account_id, phase, observations, source,
      source_event_key, received_balance_cents, confirmation_key,
      created_by, updated_by
    ) values (
      target_period_id, 5 + plan_row.sequence_number, plan_row.operated_on,
      'balance_update', plan_row.balance_before_cents, plan_row.balance_after_cents,
      plan_row.operating_result_cents, lucid_company_id, plan_row.account_ids[1],
      plan_row.phase, plan_row.observations, 'ninjatrader',
      plan_row.source_event_key, plan_row.balance_after_cents, gen_random_uuid(),
      david_id, admin_id
    ) returning id into repaired_control_id;

    insert into public.daily_control_participants(
      daily_control_id, period_id, account_id, role, allocated_result_cents
    )
    select repaired_control_id, target_period_id, item.account_id,
      case when item.ordinality = 1
        then 'leader'::public.daily_control_participant_role
        else 'replica'::public.daily_control_participant_role end,
      item.allocated_result_cents
    from unnest(plan_row.account_ids, plan_row.allocations)
      with ordinality item(account_id, allocated_result_cents, ordinality);

    insert into public.operation_entries(
      period_id, daily_control_id, account_id, operated_on, phase,
      participant_role, destination, magnitude_cents, created_by, updated_by
    )
    select target_period_id, repaired_control_id, item.account_id,
      plan_row.operated_on, plan_row.phase,
      case when item.ordinality = 1
        then 'leader'::public.daily_control_participant_role
        else 'replica'::public.daily_control_participant_role end,
      case when item.allocated_result_cents > 0 then 'NETO BROKER +'::public.broker_result_destination
        when item.allocated_result_cents < 0 then 'NETO BROKER -'::public.broker_result_destination
        else 'NONE'::public.broker_result_destination end,
      abs(item.allocated_result_cents), david_id, admin_id
    from unnest(plan_row.account_ids, plan_row.allocations)
      with ordinality item(account_id, allocated_result_cents, ordinality);
  end loop;

  -- El tercer lote se creó antes de que el reproceso asociara las réplicas.
  insert into public.ninja_operation_batch_members(
    batch_id, session_id, account_id, role, allocated_broker_result_cents
  )
  select 'acdd5108-8261-4676-b8ab-581771eb2026'::uuid,
    sessions.id, links.account_id, 'prop', 1652
  from public.ninja_operation_probe_sessions sessions
  join public.ninja_account_links links
    on links.connector_id = personal_connector_id
    and links.external_account_name = sessions.account_name
  where sessions.connector_id = personal_connector_id
    and sessions.opened_at >= timestamptz '2026-11-11 14:06:00+00'
    and sessions.opened_at < timestamptz '2026-11-11 14:07:00+00'
    and sessions.account_name like 'LFE050913723200%'
    and not exists (
      select 1 from public.ninja_operation_batch_members existing
      where existing.batch_id = 'acdd5108-8261-4676-b8ab-581771eb2026'::uuid
        and existing.session_id = sessions.id
    );

  if (select count(*) from public.ninja_operation_batch_members
      where batch_id = 'acdd5108-8261-4676-b8ab-581771eb2026'::uuid
        and role = 'prop') <> 5
  then raise exception 'David November 11 batch still lacks five prop members'; end if;

  update public.ninja_operation_batches batches
  set status = 'ready', distributed_cents = plan.operating_result_cents,
    rounding_difference_cents = 0, accounting_mode = 'active',
    accounting_status = 'committed', accounting_blocking_reason = null,
    accounting_period_id = target_period_id,
    accounting_company_id = lucid_company_id,
    accounting_phase = plan.phase, operated_on = plan.operated_on,
    daily_control_id = controls.id, updated_at = now()
  from david_recent_repair_plan plan
  join public.daily_controls controls
    on controls.period_id = target_period_id
    and controls.source_event_key = plan.source_event_key
  where plan.batch_id is not null and batches.id = plan.batch_id;
  get diagnostics changed_count = row_count;
  if changed_count <> 3 then raise exception 'Expected three David batches to commit'; end if;

  update public.ninja_broker_balance_events events
  set status = 'confirmed', daily_control_id = controls.id,
    resolved_at = coalesce(events.resolved_at, now())
  from public.daily_controls controls
  where controls.period_id = target_period_id
    and events.connector_id = personal_connector_id
    and events.source_event_id = controls.source_event_key
    and controls.source_event_key in (
      'ninja-operation:1172350', 'ninja-operation:1206938', 'ninja-operation:1221867'
    );

  update public.ninja_broker_balance_events events
  set status = 'confirmed', daily_control_id = controls.id,
    resolved_at = coalesce(events.resolved_at, now())
  from public.daily_controls controls
  where controls.period_id = target_period_id
    and controls.source_event_key = 'inventory-recovery:david:jhordan:2026-11-09'
    and events.connector_id = personal_connector_id
    and events.source_event_id = 'ninja-preoperation:1172350';

  update public.ninja_account_links links
  set accounting_phase = 'Cuarta vuelta', completed_trade_days = 0
  where links.connector_id = jhordan_connector_id
    and links.account_id = any(jhordan_ids);

  update public.ninja_account_links links
  set accounting_phase = 'Evaluacion', completed_trade_days = 0
  where links.connector_id = personal_connector_id
    and links.account_id = any(personal_ids);

  update public.ninja_account_links links
  set accounting_phase = 'Evaluacion', completed_trade_days = 0
  where links.connector_id = sebastian_connector_id
    and links.account_id = any(sebastian_ids);

  update public.ninja_account_links links
  set accounting_phase = 'Evaluacion', completed_trade_days = 0
  where links.connector_id = ramses_connector_id
    and links.account_id = any(ramses_ids);

  if (select count(*) from public.daily_controls where period_id = target_period_id) <> 18
    or (select count(*) from public.daily_control_participants participants
        join public.daily_controls controls on controls.id = participants.daily_control_id
        where controls.period_id = target_period_id and controls.control_number between 6 and 18) <> 65
    or (select count(*) from public.operation_entries entries
        join public.daily_controls controls on controls.id = entries.daily_control_id
        where controls.period_id = target_period_id and controls.control_number between 6 and 18) <> 65
    or (select balance_after_cents from public.daily_controls
        where period_id = target_period_id and control_number = 18) <> 874366
    or exists (
      select 1 from public.ninja_operation_batches
      where id = any(array[
        '36a8ea8f-d0c6-411f-8bf2-bdf896f4e66c'::uuid,
        '058e8540-995c-4b4b-9ba0-d451bb8d5c0c'::uuid,
        'acdd5108-8261-4676-b8ab-581771eb2026'::uuid
      ]) and (accounting_status <> 'committed' or daily_control_id is null)
    )
  then raise exception 'David recent repair integrity check failed'; end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id, 'periods', target_period_id,
    'david_recent_identity_reconciliation_chain_repaired',
    jsonb_build_object(
      'backup_schema', 'private_david_recent_repair_20261111',
      'controls_created', 13,
      'participants_created', 65,
      'first_balance_cents', 986952,
      'final_balance_cents', 874366,
      'net_result_cents', -112586,
      'committed_batches', jsonb_build_array(
        '36a8ea8f-d0c6-411f-8bf2-bdf896f4e66c',
        '058e8540-995c-4b4b-9ba0-d451bb8d5c0c',
        'acdd5108-8261-4676-b8ab-581771eb2026'
      ),
      'identity_inventory_recoveries', 10,
      'telemetry_recreated', false
    ),
    'Reconstrucción cronológica solicitada por Mauricio: operaciones de identidades sin ejecuciones y lotes personales bloqueados por el saldo atrasado.'
  );
end;
$repair$;

commit;
