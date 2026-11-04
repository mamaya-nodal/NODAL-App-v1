-- Recupera dos operaciones de Identidades que llegaron únicamente como
-- inventario (sin ejecuciones técnicas) y, al restablecer la continuidad del
-- broker, confirma el lote Tradeify posterior que había quedado bloqueado.

begin;

create schema if not exists private_lorena_chain_repair_20261104;
revoke all on schema private_lorena_chain_repair_20261104 from public, anon, authenticated;

create table if not exists private_lorena_chain_repair_20261104.daily_controls as
select * from public.daily_controls
where period_id = '6325a8a9-1ac4-469b-84fa-08e040faf81b'::uuid;

create table if not exists private_lorena_chain_repair_20261104.accounts as
select * from public.accounts
where id = any(array[
  'b8d9d714-b8d3-4b6d-be52-fb45582189d6'::uuid,
  'c2bd2e83-2d4c-4d2d-8dcf-6956b4ea4e7a'::uuid,
  'f8dc962a-f8a1-4da9-b73a-11a3b7d03060'::uuid,
  '8b898601-f1de-47e4-a6fd-51fa1ea1d4f8'::uuid,
  '08b81982-08a4-424c-aba2-b69a09b8cd64'::uuid,
  '47833c78-4c4a-41fb-9fa1-a8a592511e58'::uuid,
  'd2b7774b-21b4-474b-acc3-58fd23554713'::uuid,
  'd78bee95-7456-45ae-adb3-d3aa6cbec434'::uuid,
  '59c05fac-cb20-44c2-a2b1-4922ed5b1b6e'::uuid,
  'a85ed3b6-c226-4c67-baa8-5c982e38f13a'::uuid
]);

create table if not exists private_lorena_chain_repair_20261104.ninja_account_links as
select * from public.ninja_account_links
where account_id in (select id from private_lorena_chain_repair_20261104.accounts);

do $repair$
declare
  lore_id constant uuid := '2b0f63da-bf32-41ee-86c2-98fb5dbe583b';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_period_id constant uuid := '6325a8a9-1ac4-469b-84fa-08e040faf81b';
  lucid_company_id constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  personal_connector_id constant uuid := 'cfefc40f-e916-4469-aae8-47a508ac7a42';
  david_connector_id constant uuid := 'a697d39d-a2c6-439f-aa8a-fc9075da40e5';
  gino_connector_id constant uuid := '45f42900-1fb7-419f-97f7-532d210083a9';
  tradeify_batch_id constant uuid := 'a0b8bbb1-2066-4b40-9be6-95af18cbddd8';
  david_account_ids constant uuid[] := array[
    'b8d9d714-b8d3-4b6d-be52-fb45582189d6'::uuid,
    'c2bd2e83-2d4c-4d2d-8dcf-6956b4ea4e7a'::uuid,
    'f8dc962a-f8a1-4da9-b73a-11a3b7d03060'::uuid,
    '8b898601-f1de-47e4-a6fd-51fa1ea1d4f8'::uuid,
    '08b81982-08a4-424c-aba2-b69a09b8cd64'::uuid
  ];
  gino_account_ids constant uuid[] := array[
    '47833c78-4c4a-41fb-9fa1-a8a592511e58'::uuid,
    'd2b7774b-21b4-474b-acc3-58fd23554713'::uuid,
    'd78bee95-7456-45ae-adb3-d3aa6cbec434'::uuid,
    '59c05fac-cb20-44c2-a2b1-4922ed5b1b6e'::uuid,
    'a85ed3b6-c226-4c67-baa8-5c982e38f13a'::uuid
  ];
  david_control_id uuid;
  gino_control_id uuid;
  tradeify_control_id uuid;
  changed_count integer;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'periods'
      and events.entity_id = target_period_id
      and events.action = 'lorena_missing_identity_and_tradeify_chain_repaired'
  ) then return; end if;

  if (select count(*) from public.daily_controls where period_id = target_period_id) <> 14
    or not exists (
      select 1 from public.daily_controls controls
      where controls.period_id = target_period_id
        and controls.control_number = 14
        and controls.balance_after_cents = 711002
        and controls.operating_result_cents = -39490
    )
  then raise exception 'Lorena control chain changed; aborting controlled repair'; end if;

  if (select count(*) from public.ninja_account_links links
      join public.accounts accounts on accounts.id = links.account_id
      where links.connector_id = david_connector_id
        and links.account_id = any(david_account_ids)
        and links.closed_at is null
        and links.phase = 'Evaluation'
        and links.accounting_phase = 'Evaluacion'
        and links.completed_trade_days = 0
        and accounts.period_id = target_period_id
        and accounts.company_id = lucid_company_id
        and accounts.state = 'virgin') <> 5
    or exists (select 1 from public.operation_entries where account_id = any(david_account_ids))
  then raise exception 'Expected five unaccounted Lucid David accounts'; end if;

  if (select count(*) from public.ninja_account_links links
      join public.accounts accounts on accounts.id = links.account_id
      where links.connector_id = gino_connector_id
        and links.account_id = any(gino_account_ids)
        and links.closed_at is null
        and links.phase = 'Evaluation'
        and links.accounting_phase = 'Evaluacion'
        and links.completed_trade_days = 0
        and accounts.period_id = target_period_id
        and accounts.company_id = lucid_company_id
        and accounts.state = 'live') <> 5
    or exists (select 1 from public.operation_entries where account_id = any(gino_account_ids))
  then raise exception 'Expected five unaccounted Lucid Gino accounts'; end if;

  if not exists (
    select 1
    from public.ninja_operation_batches batches
    join public.ninja_operation_probe_sessions sessions on sessions.id = batches.broker_session_id
    where batches.id = tradeify_batch_id
      and batches.connector_id = personal_connector_id
      and batches.accounting_period_id = target_period_id
      and batches.status = 'ready'
      and batches.accounting_status = 'blocked'
      and batches.broker_result_cents = 99930
      and round(sessions.opening_balance * 100)::bigint = 698022
      and round(sessions.closing_balance * 100)::bigint = 797952
  ) or (select count(*) from public.ninja_operation_batch_members members
        where members.batch_id = tradeify_batch_id
          and members.role = 'prop'
          and members.allocated_broker_result_cents = 19986) <> 5
  then raise exception 'Expected blocked Lorena Tradeify batch'; end if;

  if not exists (
    select 1 from public.ninja_broker_balance_events events
    where events.connector_id = personal_connector_id
      and events.source_event_id = 'ninja-preoperation:978213'
      and events.balance_cents = 698022
      and events.status = 'pending'
  ) then raise exception 'Lorena Tradeify preoperation evidence changed'; end if;

  insert into public.daily_controls(
    period_id, control_number, operated_on, kind,
    balance_before_cents, balance_after_cents, operating_result_cents,
    company_id, leader_account_id, phase, observations, source,
    source_event_key, received_balance_cents, confirmation_key,
    created_by, updated_by
  ) values (
    target_period_id, 15, date '2026-11-03', 'balance_update',
    711002, 669712, -41290, lucid_company_id, david_account_ids[1],
    'Evaluacion',
    'Recuperación auditada: el conector de la Identidad David envió inventario y saldos, pero no las ejecuciones del trade.',
    'ninjatrader', 'lore-inventory-recovery:david:2026-11-03', 669712,
    '10ed0000-0000-4000-8000-000000000015', lore_id, admin_id
  ) returning id into david_control_id;

  insert into public.daily_controls(
    period_id, control_number, operated_on, kind,
    balance_before_cents, balance_after_cents, operating_result_cents,
    company_id, leader_account_id, phase, observations, source,
    source_event_key, received_balance_cents, confirmation_key,
    created_by, updated_by
  ) values (
    target_period_id, 16, date '2026-11-03', 'balance_update',
    669712, 698022, 28310, lucid_company_id, gino_account_ids[1],
    'Evaluacion',
    'Recuperación auditada: el conector de la Identidad Gino envió inventario y saldos, pero no las ejecuciones del trade.',
    'ninjatrader', 'lore-inventory-recovery:gino:2026-11-03', 698022,
    '10e90000-0000-4000-8000-000000000016', lore_id, admin_id
  ) returning id into gino_control_id;

  insert into public.daily_control_participants(
    daily_control_id, period_id, account_id, role, allocated_result_cents
  )
  select david_control_id, target_period_id, item.account_id,
    case when item.ordinality = 1
      then 'leader'::public.daily_control_participant_role
      else 'replica'::public.daily_control_participant_role end,
    -8258
  from unnest(david_account_ids) with ordinality item(account_id, ordinality);

  insert into public.daily_control_participants(
    daily_control_id, period_id, account_id, role, allocated_result_cents
  )
  select gino_control_id, target_period_id, item.account_id,
    case when item.ordinality = 1
      then 'leader'::public.daily_control_participant_role
      else 'replica'::public.daily_control_participant_role end,
    5662
  from unnest(gino_account_ids) with ordinality item(account_id, ordinality);

  insert into public.operation_entries(
    period_id, daily_control_id, account_id, operated_on, phase,
    participant_role, destination, magnitude_cents, created_by, updated_by
  )
  select participants.period_id, participants.daily_control_id,
    participants.account_id, date '2026-11-03', 'Evaluacion', participants.role,
    case when participants.allocated_result_cents > 0
      then 'NETO BROKER +'::public.broker_result_destination
      else 'NETO BROKER -'::public.broker_result_destination end,
    abs(participants.allocated_result_cents), lore_id, admin_id
  from public.daily_control_participants participants
  where participants.daily_control_id in (david_control_id, gino_control_id);

  update public.accounts accounts
  set state = 'live', updated_at = now()
  where accounts.id = any(david_account_ids) and accounts.state <> 'live';
  if (
    select count(*)
    from public.accounts accounts
    where accounts.id = any(david_account_ids) and accounts.state = 'live'
  ) <> 5 then
    raise exception 'Expected five David accounts to be live';
  end if;

  update public.ninja_account_links links
  set accounting_phase = 'Evaluacion', completed_trade_days = 1
  where links.account_id = any(david_account_ids || gino_account_ids)
    and links.closed_at is null;
  get diagnostics changed_count = row_count;
  if changed_count <> 10 then raise exception 'Expected ten identity accounts to advance'; end if;

  update public.ninja_broker_balance_events events
  set status = 'confirmed', daily_control_id = gino_control_id,
      resolved_at = coalesce(events.resolved_at, now())
  where events.connector_id = personal_connector_id
    and events.source_event_id = 'ninja-preoperation:978213'
    and events.status = 'pending';
  if not found then raise exception 'Lorena Tradeify preoperation balance was not resolved'; end if;

  update public.ninja_operation_batches batches
  set accounting_mode = 'shadow', accounting_status = 'shadow_ready',
      accounting_blocking_reason = null, updated_at = now()
  where batches.id = tradeify_batch_id and batches.accounting_status = 'blocked';
  if not found then raise exception 'Lorena Tradeify batch was not released'; end if;

  perform set_config('request.jwt.claim.sub', lore_id::text, true);
  tradeify_control_id := public.commit_ninja_automatic_operation_batch(tradeify_batch_id);
  if tradeify_control_id is null then raise exception 'Lorena Tradeify batch was not committed'; end if;

  if not exists (
      select 1 from public.daily_controls controls
      where controls.id = david_control_id and controls.control_number = 15
        and controls.balance_before_cents = 711002
        and controls.balance_after_cents = 669712
        and controls.operating_result_cents = -41290
    ) or not exists (
      select 1 from public.daily_controls controls
      where controls.id = gino_control_id and controls.control_number = 16
        and controls.balance_before_cents = 669712
        and controls.balance_after_cents = 698022
        and controls.operating_result_cents = 28310
    ) or not exists (
      select 1 from public.daily_controls controls
      where controls.id = tradeify_control_id and controls.control_number = 17
        and controls.balance_before_cents = 698022
        and controls.balance_after_cents = 797952
        and controls.operating_result_cents = 99930
    ) or (select count(*) from public.operation_entries entries
          where entries.daily_control_id in (david_control_id, gino_control_id, tradeify_control_id)) <> 15
  then raise exception 'Lorena repaired operation chain failed integrity validation'; end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id, 'periods', target_period_id,
    'lorena_missing_identity_and_tradeify_chain_repaired',
    jsonb_build_object(
      'backup_schema', 'private_lorena_chain_repair_20261104',
      'david_control_id', david_control_id,
      'david_broker_result_cents', -41290,
      'david_prop_closing_balance_cents', 5150300,
      'gino_control_id', gino_control_id,
      'gino_broker_result_cents', 28310,
      'gino_prop_closing_balance_cents', 4879800,
      'tradeify_batch_id', tradeify_batch_id,
      'tradeify_control_id', tradeify_control_id,
      'final_broker_balance_cents', 797952
    ),
    'Corrección solicitada por Mauricio: recuperar dos trades de Identidades observados sólo por inventario y confirmar el Tradeify posterior'
  );

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  )
  select admin_id, 'ninja_account_links', links.account_id,
    'inventory_only_operation_recovered',
    jsonb_build_object(
      'connector_id', links.connector_id,
      'external_account_name', links.external_account_name,
      'accounting_phase', links.accounting_phase,
      'completed_trade_days', links.completed_trade_days,
      'daily_control_id', case
        when links.account_id = any(david_account_ids) then david_control_id
        else gino_control_id end
    ),
    'La ejecución no llegó como telemetría; el trade se recuperó desde la secuencia de inventarios y la continuidad broker'
  from public.ninja_account_links links
  where links.account_id = any(david_account_ids || gino_account_ids)
    and links.closed_at is null;
end;
$repair$;

commit;
