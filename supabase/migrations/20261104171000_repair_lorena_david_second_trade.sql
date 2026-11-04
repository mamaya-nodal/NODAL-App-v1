-- Recupera la segunda operación de las cinco Lucid de la identidad David.
-- El conector 0.16 conservó inventarios y saldos antes/durante/después del
-- trade, pero no emitió ejecuciones. No se recrea telemetría inexistente.

begin;

create schema if not exists private_lorena_david_trade_repair_20261104;
revoke all on schema private_lorena_david_trade_repair_20261104 from public, anon, authenticated;

create table if not exists private_lorena_david_trade_repair_20261104.daily_controls as
select * from public.daily_controls
where period_id = '6325a8a9-1ac4-469b-84fa-08e040faf81b'::uuid;

create table if not exists private_lorena_david_trade_repair_20261104.ninja_account_links as
select * from public.ninja_account_links
where account_id = any(array[
  'b8d9d714-b8d3-4b6d-be52-fb45582189d6'::uuid,
  'c2bd2e83-2d4c-4d2d-8dcf-6956b4ea4e7a'::uuid,
  'f8dc962a-f8a1-4da9-b73a-11a3b7d03060'::uuid,
  '8b898601-f1de-47e4-a6fd-51fa1ea1d4f8'::uuid,
  '08b81982-08a4-424c-aba2-b69a09b8cd64'::uuid
]);

do $repair$
declare
  lore_id constant uuid := '2b0f63da-bf32-41ee-86c2-98fb5dbe583b';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_period_id constant uuid := '6325a8a9-1ac4-469b-84fa-08e040faf81b';
  lucid_company_id constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  david_connector_id constant uuid := 'a697d39d-a2c6-439f-aa8a-fc9075da40e5';
  personal_connector_id constant uuid := 'cfefc40f-e916-4469-aae8-47a508ac7a42';
  david_account_ids constant uuid[] := array[
    'b8d9d714-b8d3-4b6d-be52-fb45582189d6'::uuid,
    'c2bd2e83-2d4c-4d2d-8dcf-6956b4ea4e7a'::uuid,
    'f8dc962a-f8a1-4da9-b73a-11a3b7d03060'::uuid,
    '8b898601-f1de-47e4-a6fd-51fa1ea1d4f8'::uuid,
    '08b81982-08a4-424c-aba2-b69a09b8cd64'::uuid
  ];
  repaired_control_id uuid;
  changed_count integer;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'periods'
      and events.entity_id = target_period_id
      and events.action = 'lorena_david_second_trade_repaired'
  ) then return; end if;

  if (select count(*) from public.daily_controls where period_id = target_period_id) <> 17
    or not exists (
      select 1 from public.daily_controls controls
      where controls.period_id = target_period_id
        and controls.control_number = 17
        and controls.balance_after_cents = 797952
        and controls.operating_result_cents = 99930
    )
  then raise exception 'Lorena control chain changed; aborting David second trade repair'; end if;

  if (select count(*) from public.ninja_account_links links
      join public.accounts accounts on accounts.id = links.account_id
      where links.connector_id = david_connector_id
        and links.account_id = any(david_account_ids)
        and links.closed_at is null
        and links.phase = 'Evaluation'
        and links.accounting_phase = 'Evaluacion'
        and links.completed_trade_days = 1
        and accounts.period_id = target_period_id
        and accounts.company_id = lucid_company_id
        and accounts.state = 'live') <> 5
    or (select count(*) from public.operation_entries entries
        where entries.account_id = any(david_account_ids)) <> 5
  then raise exception 'Expected five David accounts at Evaluation day 1'; end if;

  if not exists (
      select 1 from public.ninja_inventory_snapshots snapshots
      where snapshots.physical_connector_id = david_connector_id
        and snapshots.connector_id = david_connector_id
        and snapshots.observed_at = timestamptz '2026-11-04 12:36:34.116424-03'
        and snapshots.account_count = 5
        and not exists (
          select 1 from jsonb_array_elements(snapshots.accounts) account
          where round((account->>'netLiquidation')::numeric * 100)::bigint <> 5150300
        )
    ) or not exists (
      select 1 from public.ninja_inventory_snapshots snapshots
      where snapshots.physical_connector_id = david_connector_id
        and snapshots.connector_id = personal_connector_id
        and snapshots.observed_at = timestamptz '2026-11-04 12:36:34.116424-03'
        and snapshots.account_count = 1
        and round(((snapshots.accounts->0)->>'netLiquidation')::numeric * 100)::bigint = 797952
    )
  then raise exception 'David preoperation inventory evidence changed'; end if;

  if not exists (
      select 1 from public.ninja_inventory_snapshots snapshots
      where snapshots.physical_connector_id = david_connector_id
        and snapshots.connector_id = david_connector_id
        and snapshots.observed_at = timestamptz '2026-11-04 12:38:12.478733-03'
        and snapshots.account_count = 5
        and not exists (
          select 1 from jsonb_array_elements(snapshots.accounts) account
          where round((account->>'netLiquidation')::numeric * 100)::bigint <> 5027450
        )
    ) or not exists (
      select 1 from public.ninja_inventory_snapshots snapshots
      where snapshots.physical_connector_id = david_connector_id
        and snapshots.connector_id = personal_connector_id
        and snapshots.observed_at = timestamptz '2026-11-04 12:38:12.478733-03'
        and snapshots.account_count = 1
        and round(((snapshots.accounts->0)->>'netLiquidation')::numeric * 100)::bigint = 856562
    )
  then raise exception 'David postoperation inventory evidence changed'; end if;

  if exists (
    select 1 from public.ninja_event_receipts receipts
    where receipts.physical_connector_id = david_connector_id
      and receipts.created_at >= timestamptz '2026-11-04 12:35:00-03'
      and receipts.created_at <= timestamptz '2026-11-04 12:40:00-03'
  ) then raise exception 'Unexpected execution telemetry exists for David second trade'; end if;

  insert into public.daily_controls(
    period_id, control_number, operated_on, kind,
    balance_before_cents, balance_after_cents, operating_result_cents,
    company_id, leader_account_id, phase, observations, source,
    source_event_key, received_balance_cents, confirmation_key,
    created_by, updated_by
  ) values (
    target_period_id, 18, date '2026-11-04', 'balance_update',
    797952, 856562, 58610, lucid_company_id, david_account_ids[1],
    'Evaluacion',
    'Recuperación auditada: segundo trade de las cinco Lucid de la Identidad David, observado sólo en inventarios antes de actualizar el conector.',
    'ninjatrader', 'lore-inventory-recovery:david:2026-11-04:2', 856562,
    '10ed0000-0000-4000-8000-000000000018', lore_id, admin_id
  ) returning id into repaired_control_id;

  insert into public.daily_control_participants(
    daily_control_id, period_id, account_id, role, allocated_result_cents
  )
  select repaired_control_id, target_period_id, item.account_id,
    case when item.ordinality = 1
      then 'leader'::public.daily_control_participant_role
      else 'replica'::public.daily_control_participant_role end,
    11722
  from unnest(david_account_ids) with ordinality item(account_id, ordinality);

  insert into public.operation_entries(
    period_id, daily_control_id, account_id, operated_on, phase,
    participant_role, destination, magnitude_cents, created_by, updated_by
  )
  select participants.period_id, participants.daily_control_id,
    participants.account_id, date '2026-11-04', 'Evaluacion', participants.role,
    'NETO BROKER +'::public.broker_result_destination,
    participants.allocated_result_cents, lore_id, admin_id
  from public.daily_control_participants participants
  where participants.daily_control_id = repaired_control_id;

  update public.ninja_account_links links
  set completed_trade_days = 2
  where links.connector_id = david_connector_id
    and links.account_id = any(david_account_ids)
    and links.closed_at is null
    and links.completed_trade_days = 1;
  get diagnostics changed_count = row_count;
  if changed_count <> 5 then raise exception 'Expected five David accounts to advance to day 2'; end if;

  if not exists (
      select 1 from public.daily_controls controls
      where controls.id = repaired_control_id
        and controls.control_number = 18
        and controls.balance_before_cents = 797952
        and controls.balance_after_cents = 856562
        and controls.operating_result_cents = 58610
    ) or (select count(*) from public.daily_control_participants participants
          where participants.daily_control_id = repaired_control_id
            and participants.allocated_result_cents = 11722) <> 5
      or (select count(*) from public.operation_entries entries
          where entries.daily_control_id = repaired_control_id
            and entries.destination = 'NETO BROKER +'
            and entries.magnitude_cents = 11722) <> 5
  then raise exception 'Lorena David second trade integrity check failed'; end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id, 'periods', target_period_id,
    'lorena_david_second_trade_repaired',
    jsonb_build_object(
      'backup_schema', 'private_lorena_david_trade_repair_20261104',
      'daily_control_id', repaired_control_id,
      'identity_connector_id', david_connector_id,
      'account_count', 5,
      'broker_result_cents', 58610,
      'allocated_per_account_cents', 11722,
      'prop_opening_balance_cents', 5150300,
      'prop_closing_balance_cents', 5027450,
      'final_broker_balance_cents', 856562,
      'completed_trade_days', 2,
      'telemetry_recreated', false
    ),
    'Corrección solicitada por Mauricio: recuperar el trade de Lore con la Identidad David anterior a la actualización 0.17'
  );
end;
$repair$;

commit;
