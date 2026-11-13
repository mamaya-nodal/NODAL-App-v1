-- Repara dos coberturas de David Zabaleta que el correlador omitió porque
-- MIMICAL abrió las réplicas 14-16 segundos después de la cuenta broker.
-- La tercera lectura del 13/11 queda intacta: fue un trade broker sin cuentas
-- prop simultáneas y no debe forzarse como cobertura.

begin;

create schema if not exists private_david_repair_20261113;
revoke all on schema private_david_repair_20261113 from public, anon, authenticated;

create table if not exists private_david_repair_20261113.daily_controls as
select * from public.daily_controls
where period_id = 'f028cd3d-aef3-45b5-a088-fa92e54c70e9'::uuid;

create table if not exists private_david_repair_20261113.daily_control_participants as
select participants.* from public.daily_control_participants participants
where participants.period_id = 'f028cd3d-aef3-45b5-a088-fa92e54c70e9'::uuid;

create table if not exists private_david_repair_20261113.operation_entries as
select entries.* from public.operation_entries entries
where entries.period_id = 'f028cd3d-aef3-45b5-a088-fa92e54c70e9'::uuid;

create table if not exists private_david_repair_20261113.ninja_operation_batches as
select * from public.ninja_operation_batches
where id = any(array[
  '566bd537-6e8d-435a-a4ae-3ee04413af76'::uuid,
  '20916067-13d7-4cf2-bda6-d19c4ce917a2'::uuid
]);

create table if not exists private_david_repair_20261113.ninja_operation_batch_members as
select * from public.ninja_operation_batch_members
where batch_id = any(array[
  '566bd537-6e8d-435a-a4ae-3ee04413af76'::uuid,
  '20916067-13d7-4cf2-bda6-d19c4ce917a2'::uuid
]);

create table if not exists private_david_repair_20261113.ninja_broker_balance_events as
select * from public.ninja_broker_balance_events
where id = any(array[
  'de7343dc-5c96-46f7-907d-bcb9b43dc5bc'::uuid,
  '43704a0c-11df-49c0-b342-bd480e5fe9d9'::uuid
]);

create table if not exists private_david_repair_20261113.ninja_account_links as
select * from public.ninja_account_links
where account_id = any(array[
  'e481ec6d-98df-49a8-9e1c-8e3f566277a6'::uuid,
  'c8a67dfe-4ed8-4155-ac6b-05deee896719'::uuid,
  'c680aecf-a87c-4535-b43d-cd1a48c50d0f'::uuid,
  '57bc1057-6770-476d-9cf3-e5bf344b431f'::uuid,
  'dd791a6c-b8f6-4484-b02d-f84a017f1921'::uuid
]);

create table if not exists private_david_repair_20261113.nodal_agent_cases as
select * from public.nodal_agent_cases
where subject_user_id = 'b1afb804-fb3f-4424-b9ab-5e0e0b0ec887'::uuid
  and status not in ('resolved', 'dismissed');

do $repair$
declare
  david_id constant uuid := 'b1afb804-fb3f-4424-b9ab-5e0e0b0ec887';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_period constant uuid := 'f028cd3d-aef3-45b5-a088-fa92e54c70e9';
  lucid_company constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  account_ids constant uuid[] := array[
    'e481ec6d-98df-49a8-9e1c-8e3f566277a6'::uuid,
    'c8a67dfe-4ed8-4155-ac6b-05deee896719'::uuid,
    'c680aecf-a87c-4535-b43d-cd1a48c50d0f'::uuid,
    '57bc1057-6770-476d-9cf3-e5bf344b431f'::uuid,
    'dd791a6c-b8f6-4484-b02d-f84a017f1921'::uuid
  ];
  control_12 uuid;
  control_13 uuid;
  item record;
begin
  if exists (
    select 1 from public.audit_events
    where entity_table = 'periods' and entity_id = target_period
      and action = 'david_nov12_nov13_reconciliations_repaired'
  ) then return; end if;

  if (select count(*) from public.daily_controls where period_id = target_period) <> 19
    or not exists (
      select 1 from public.daily_controls
      where period_id = target_period and control_number = 19
        and balance_after_cents = 834826
    )
  then raise exception 'David control chain changed; aborting repair'; end if;

  if (select count(*) from public.accounts
      where id = any(account_ids) and period_id = target_period
        and company_id = lucid_company) <> 5
  then raise exception 'David Lucid account group changed; aborting repair'; end if;

  if not exists (
    select 1 from public.ninja_operation_batches
    where id = '566bd537-6e8d-435a-a4ae-3ee04413af76'::uuid
      and broker_result_cents = 95910 and daily_control_id is null
  ) or not exists (
    select 1 from public.ninja_operation_batches
    where id = '20916067-13d7-4cf2-bda6-d19c4ce917a2'::uuid
      and broker_result_cents = 8310 and daily_control_id is null
  ) then raise exception 'David target batches changed; aborting repair'; end if;

  insert into public.daily_controls(
    period_id, control_number, operated_on, kind,
    balance_before_cents, balance_after_cents, operating_result_cents,
    company_id, leader_account_id, phase, observations, source,
    source_event_key, received_balance_cents, sync_issue_reason, confirmation_key,
    created_by, updated_by
  ) values (
    target_period, 20, date '2026-11-12', 'balance_update',
    834826, 930736, 95910, lucid_company, account_ids[1], 'Evaluacion',
    'Cobertura recuperada: cinco cuentas LUCID DAVID omitidas por demora de 14 segundos al abrir las réplicas.',
    'ninjatrader', 'ninja-operation:1241172', 930736, null,
    '566bd537-6e8d-435a-a4ae-3ee04413af76'::uuid, david_id, admin_id
  ) returning id into control_12;

  insert into public.daily_controls(
    period_id, control_number, operated_on, kind,
    balance_before_cents, balance_after_cents, operating_result_cents,
    company_id, leader_account_id, phase, observations, source,
    source_event_key, received_balance_cents, sync_issue_reason,
    confirmation_key, created_by, updated_by
  ) values (
    target_period, 21, date '2026-11-13', 'balance_update',
    930736, 939046, 8310, lucid_company, account_ids[1], 'Evaluacion',
    'Cobertura recuperada: cinco cuentas LUCID DAVID omitidas por demora de 15 segundos al abrir las réplicas.',
    'ninjatrader', 'ninja-operation:1306936', 696526,
    'El saldo broker llegó con una diferencia preoperativa de -US$ 2.425,20 pendiente de clasificar; la operación de +US$ 83,10 quedó conciliada sin ocultar esa diferencia.',
    '20916067-13d7-4cf2-bda6-d19c4ce917a2'::uuid, david_id, admin_id
  ) returning id into control_13;

  for item in
    select account_id, ordinality
    from unnest(account_ids) with ordinality as accounts(account_id, ordinality)
  loop
    insert into public.daily_control_participants(
      daily_control_id, period_id, account_id, role, allocated_result_cents
    ) values (
      control_12, target_period, item.account_id,
      case when item.ordinality = 1 then 'leader'::public.daily_control_participant_role
        else 'replica'::public.daily_control_participant_role end,
      19182
    );
    insert into public.daily_control_participants(
      daily_control_id, period_id, account_id, role, allocated_result_cents
    ) values (
      control_13, target_period, item.account_id,
      case when item.ordinality = 1 then 'leader'::public.daily_control_participant_role
        else 'replica'::public.daily_control_participant_role end,
      1662
    );

    insert into public.operation_entries(
      period_id, daily_control_id, account_id, operated_on, phase,
      participant_role, destination, magnitude_cents, created_by, updated_by
    ) values
      (target_period, control_12, item.account_id, date '2026-11-12', 'Evaluacion',
       case when item.ordinality = 1 then 'leader'::public.daily_control_participant_role
         else 'replica'::public.daily_control_participant_role end,
       'NETO BROKER +', 19182, david_id, admin_id),
      (target_period, control_13, item.account_id, date '2026-11-13', 'Evaluacion',
       case when item.ordinality = 1 then 'leader'::public.daily_control_participant_role
         else 'replica'::public.daily_control_participant_role end,
       'NETO BROKER +', 1662, david_id, admin_id);
  end loop;

  insert into public.ninja_operation_batch_members(
    batch_id, session_id, account_id, role, allocated_broker_result_cents
  ) values
    ('566bd537-6e8d-435a-a4ae-3ee04413af76', 3840406, null, 'broker', null),
    ('566bd537-6e8d-435a-a4ae-3ee04413af76', 3840430, account_ids[1], 'prop', 19182),
    ('566bd537-6e8d-435a-a4ae-3ee04413af76', 3840424, account_ids[2], 'prop', 19182),
    ('566bd537-6e8d-435a-a4ae-3ee04413af76', 3840422, account_ids[3], 'prop', 19182),
    ('566bd537-6e8d-435a-a4ae-3ee04413af76', 3840428, account_ids[4], 'prop', 19182),
    ('566bd537-6e8d-435a-a4ae-3ee04413af76', 3840419, account_ids[5], 'prop', 19182),
    ('20916067-13d7-4cf2-bda6-d19c4ce917a2', 3850014, null, 'broker', null),
    ('20916067-13d7-4cf2-bda6-d19c4ce917a2', 3850024, account_ids[1], 'prop', 1662),
    ('20916067-13d7-4cf2-bda6-d19c4ce917a2', 3850020, account_ids[2], 'prop', 1662),
    ('20916067-13d7-4cf2-bda6-d19c4ce917a2', 3850022, account_ids[3], 'prop', 1662),
    ('20916067-13d7-4cf2-bda6-d19c4ce917a2', 3850018, account_ids[4], 'prop', 1662),
    ('20916067-13d7-4cf2-bda6-d19c4ce917a2', 3850026, account_ids[5], 'prop', 1662)
  on conflict do nothing;

  update public.ninja_operation_batches
  set status = 'ready', distributed_cents = broker_result_cents,
      rounding_difference_cents = 0, accounting_mode = 'active',
      accounting_status = 'committed', accounting_blocking_reason = null,
      accounting_period_id = target_period, accounting_company_id = lucid_company,
      accounting_phase = 'Evaluacion', context_prop_count = 5,
      daily_control_id = case id
        when '566bd537-6e8d-435a-a4ae-3ee04413af76'::uuid then control_12
        else control_13 end,
      updated_at = now()
  where id = any(array[
    '566bd537-6e8d-435a-a4ae-3ee04413af76'::uuid,
    '20916067-13d7-4cf2-bda6-d19c4ce917a2'::uuid
  ]);

  update public.ninja_broker_balance_events
  set status = 'confirmed', daily_control_id = case id
        when 'de7343dc-5c96-46f7-907d-bcb9b43dc5bc'::uuid then control_12
        else control_13 end,
      resolved_at = now()
  where id = any(array[
    'de7343dc-5c96-46f7-907d-bcb9b43dc5bc'::uuid,
    '43704a0c-11df-49c0-b342-bd480e5fe9d9'::uuid
  ]);

  update public.ninja_account_links
  set accounting_phase = 'Evaluacion', completed_trade_days = 3
  where account_id = any(account_ids);

  update public.nodal_agent_cases
  set status = 'resolved', reviewed_at = now(), reviewed_by = admin_id,
      resolution_note = 'La operación del 12/11 fue reconstruida con sus cinco cuentas LUCID DAVID y quedó vinculada al Control Diario.'
  where subject_user_id = david_id and status = 'open'
    and source_question = any(array[
      'unbatched-session:3840430','unbatched-session:3840428',
      'unbatched-session:3840424','unbatched-session:3840422',
      'unbatched-session:3840419','unreconciled:566bd537-6e8d-435a-a4ae-3ee04413af76'
    ]);

  if (select count(*) from public.daily_control_participants
      where daily_control_id = control_12) <> 5
    or (select sum(allocated_result_cents) from public.daily_control_participants
        where daily_control_id = control_12) <> 95910
    or (select count(*) from public.daily_control_participants
        where daily_control_id = control_13) <> 5
    or (select sum(allocated_result_cents) from public.daily_control_participants
        where daily_control_id = control_13) <> 8310
  then raise exception 'David repaired allocations do not reconcile'; end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id, 'periods', target_period,
    'david_nov12_nov13_reconciliations_repaired',
    jsonb_build_object(
      'controls', jsonb_build_array(control_12, control_13),
      'batches', jsonb_build_array(
        '566bd537-6e8d-435a-a4ae-3ee04413af76',
        '20916067-13d7-4cf2-bda6-d19c4ce917a2'
      ),
      'accounts', account_ids,
      'remaining_unclassified_balance_difference_cents', -242520,
      'uncovered_batch_left_untouched', '8dde7f62-2149-4cff-85cc-b841a28c57da'
    ),
    'Reparación auditada de coberturas omitidas por tolerancia temporal insuficiente.'
  );
end
$repair$;

commit;
