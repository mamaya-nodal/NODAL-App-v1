-- Retira dos cuentas residuales de Lucid Gino que no tuvieron actividad
-- contable, registra la quema real de las cinco cuentas siguientes y libera
-- el lote posterior de Lucid Lore conservando continuidad exacta del broker.

begin;

create schema if not exists private_lorena_gino_repair_20261103;
revoke all on schema private_lorena_gino_repair_20261103 from public, anon, authenticated;

create table if not exists private_lorena_gino_repair_20261103.accounts as
select * from public.accounts
where id in (
  '530a5161-a5a0-4b4c-a158-6affc227abb1'::uuid,
  '6ec9621e-a251-4251-b602-94d4c662da40'::uuid
);
create table if not exists private_lorena_gino_repair_20261103.purchases as
select * from public.purchases
where account_id in (
  '530a5161-a5a0-4b4c-a158-6affc227abb1'::uuid,
  '6ec9621e-a251-4251-b602-94d4c662da40'::uuid
);
create table if not exists private_lorena_gino_repair_20261103.ninja_account_links as
select * from public.ninja_account_links
where account_id in (
  '530a5161-a5a0-4b4c-a158-6affc227abb1'::uuid,
  '6ec9621e-a251-4251-b602-94d4c662da40'::uuid
);
create table if not exists private_lorena_gino_repair_20261103.identity_account_assignments as
select * from public.identity_account_assignments
where account_id in (
  '530a5161-a5a0-4b4c-a158-6affc227abb1'::uuid,
  '6ec9621e-a251-4251-b602-94d4c662da40'::uuid
);

do $repair$
declare
  lore_id constant uuid := '2b0f63da-bf32-41ee-86c2-98fb5dbe583b';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_period_id constant uuid := '6325a8a9-1ac4-469b-84fa-08e040faf81b';
  lucid_company_id constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  gino_connector_id constant uuid := '45f42900-1fb7-419f-97f7-532d210083a9';
  personal_connector_id constant uuid := 'cfefc40f-e916-4469-aae8-47a508ac7a42';
  target_batch_id constant uuid := '6be92c0a-b563-42d3-bc80-368b7f693ba6';
  stale_account_ids constant uuid[] := array[
    '530a5161-a5a0-4b4c-a158-6affc227abb1'::uuid,
    '6ec9621e-a251-4251-b602-94d4c662da40'::uuid
  ];
  burned_account_ids constant uuid[] := array[
    '6736b4c7-9974-4d66-b478-72bddbe654d3'::uuid,
    'c44d220c-dddf-475c-a961-a82ad71d0fcf'::uuid,
    '7574ac91-4376-4abf-8ea7-b6f6a6eeaa8d'::uuid,
    '2b31cf49-53f8-432e-bce7-f2a27e93cf17'::uuid,
    'c160a6d1-8f32-4319-8ac2-f29a7a1c6728'::uuid
  ];
  burned_external_names constant text[] := array[
    'LFE05093696010047',
    'LFE05093696010048',
    'LFE05093696010046',
    'LFE05093696010049',
    'LFE05093696010050'
  ];
  allocation_cents constant bigint[] := array[13086, 13085, 13085, 13085, 13085];
  burn_control_id uuid;
  operation_control_id uuid;
  changed_count integer;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'periods'
      and events.entity_id = target_period_id
      and events.action = 'lorena_gino_burn_chain_repaired'
  ) then return; end if;

  if not exists (
    select 1 from public.daily_controls controls
    where controls.period_id = target_period_id
      and controls.control_number = 12
      and controls.balance_after_cents = 685066
      and controls.operating_result_cents = -54074
  ) or (select count(*) from public.daily_controls where period_id = target_period_id) <> 12 then
    raise exception 'Lorena control chain changed; aborting Gino repair';
  end if;

  if (select count(*) from public.accounts accounts
      where accounts.id = any(stale_account_ids)
        and accounts.period_id = target_period_id
        and accounts.state = 'closed') <> 2
    or exists (select 1 from public.operation_entries where account_id = any(stale_account_ids))
    or exists (select 1 from public.daily_control_participants where account_id = any(stale_account_ids))
    or exists (select 1 from public.account_phase_withdrawals where account_id = any(stale_account_ids))
    or exists (select 1 from public.funding_withdrawals where account_id = any(stale_account_ids))
    or exists (select 1 from public.manual_account_balance_observations where account_id = any(stale_account_ids))
    or exists (select 1 from public.account_period_carryovers where account_id = any(stale_account_ids))
    or exists (select 1 from public.ninja_operation_batch_members where account_id = any(stale_account_ids))
  then raise exception 'Historical Gino residues gained dependencies; aborting controlled removal'; end if;

  if (select count(*) from public.ninja_account_links links
      where links.account_id = any(burned_account_ids)
        and links.connector_id = gino_connector_id
        and links.external_account_name = any(burned_external_names)
        and links.closed_at = '2026-11-03T17:41:28.053634+00:00'
        and links.closure_reason = 'burned') <> 5
    or exists (select 1 from public.operation_entries where account_id = any(burned_account_ids))
    or exists (select 1 from public.daily_control_participants where account_id = any(burned_account_ids))
  then raise exception 'Expected five unaccounted Lucid Gino burns'; end if;

  if not exists (
    select 1 from public.ninja_broker_balance_events events
    where events.connector_id = personal_connector_id
      and events.source_event_id = 'ninja-preoperation:959188'
      and events.balance_cents = 750492
      and events.status = 'pending'
  ) then raise exception 'Lorena preoperation broker evidence changed'; end if;

  if not exists (
    select 1
    from public.ninja_operation_batches batches
    join public.ninja_operation_probe_sessions sessions on sessions.id = batches.broker_session_id
    where batches.id = target_batch_id
      and batches.connector_id = personal_connector_id
      and batches.accounting_period_id = target_period_id
      and batches.status = 'ready'
      and batches.accounting_status = 'blocked'
      and batches.broker_result_cents = -39490
      and round(sessions.opening_balance * 100)::bigint = 750492
      and round(sessions.closing_balance * 100)::bigint = 711002
  ) or (select count(*) from public.ninja_operation_batch_members members
        where members.batch_id = target_batch_id
          and members.role = 'prop'
          and members.allocated_broker_result_cents = -7898) <> 5
  then raise exception 'Lorena blocked Lucid batch changed'; end if;

  delete from public.identity_account_assignments where account_id = any(stale_account_ids);
  get diagnostics changed_count = row_count;
  if changed_count <> 2 then raise exception 'Expected two stale identity assignments'; end if;
  delete from public.ninja_account_links where account_id = any(stale_account_ids);
  get diagnostics changed_count = row_count;
  if changed_count <> 2 then raise exception 'Expected two stale Ninja links'; end if;
  delete from public.purchases where account_id = any(stale_account_ids);
  get diagnostics changed_count = row_count;
  if changed_count <> 2 then raise exception 'Expected two stale purchases'; end if;
  delete from public.accounts where id = any(stale_account_ids);
  get diagnostics changed_count = row_count;
  if changed_count <> 2 then raise exception 'Expected two stale accounts'; end if;

  update public.identity_account_assignments assignments
  set unassigned_at = '2026-11-03T17:41:28.053634+00:00',
      ended_by = admin_id,
      correction_reason = 'Cuenta cerrada por quema; cierre contable recuperado el 03/11'
  where assignments.account_id = any(burned_account_ids)
    and assignments.unassigned_at is null;
  get diagnostics changed_count = row_count;
  if changed_count <> 5 then raise exception 'Expected five active Gino assignments to close'; end if;

  insert into public.daily_controls(
    period_id, control_number, operated_on, kind,
    balance_before_cents, balance_after_cents, operating_result_cents,
    company_id, leader_account_id, phase, observations, source,
    source_event_key, received_balance_cents, confirmation_key,
    created_by, updated_by
  ) values (
    target_period_id, 13, date '2026-11-03', 'balance_update',
    685066, 750492, 65426, lucid_company_id, burned_account_ids[1],
    'Evaluacion',
    'Quema de cinco cuentas Lucid Gino recuperada desde el salto broker y el inventario cerrado del conector.',
    'ninjatrader', 'lore-gino-burn:2026-11-03', 750492,
    '65426000-0000-4000-8000-000000000001', lore_id, admin_id
  ) returning id into burn_control_id;

  insert into public.daily_control_participants(
    daily_control_id, period_id, account_id, role, allocated_result_cents
  )
  select burn_control_id, target_period_id, item.account_id,
    case when item.ordinality = 1
      then 'leader'::public.daily_control_participant_role
      else 'replica'::public.daily_control_participant_role end,
    allocation_cents[item.ordinality]
  from unnest(burned_account_ids) with ordinality item(account_id, ordinality);

  insert into public.operation_entries(
    period_id, daily_control_id, account_id, operated_on, phase,
    participant_role, destination, magnitude_cents,
    created_by, updated_by
  )
  select target_period_id, burn_control_id, item.account_id,
    date '2026-11-03', 'Evaluacion',
    case when item.ordinality = 1
      then 'leader'::public.daily_control_participant_role
      else 'replica'::public.daily_control_participant_role end,
    'NETO BROKER +'::public.broker_result_destination,
    allocation_cents[item.ordinality], lore_id, admin_id
  from unnest(burned_account_ids) with ordinality item(account_id, ordinality);

  update public.ninja_broker_balance_events events
  set status = 'confirmed', daily_control_id = burn_control_id,
      resolved_at = coalesce(events.resolved_at, now())
  where events.connector_id = personal_connector_id
    and events.source_event_id = 'ninja-preoperation:959188'
    and events.status = 'pending';
  if not found then raise exception 'Lorena preoperation balance was not confirmed'; end if;

  update public.ninja_operation_batches batches
  set accounting_mode = 'shadow', accounting_status = 'shadow_ready',
      accounting_blocking_reason = null, updated_at = now()
  where batches.id = target_batch_id and batches.accounting_status = 'blocked';
  if not found then raise exception 'Lorena blocked batch was not released'; end if;

  perform set_config('request.jwt.claim.sub', lore_id::text, true);
  operation_control_id := public.commit_ninja_automatic_operation_batch(target_batch_id);
  if operation_control_id is null then raise exception 'Lorena Lucid batch was not committed'; end if;

  if not exists (
    select 1 from public.daily_controls controls
    where controls.id = burn_control_id
      and controls.control_number = 13
      and controls.balance_before_cents = 685066
      and controls.balance_after_cents = 750492
      and controls.operating_result_cents = 65426
  ) or (select sum(participants.allocated_result_cents)
        from public.daily_control_participants participants
        where participants.daily_control_id = burn_control_id) <> 65426
    or not exists (
      select 1 from public.daily_controls controls
      where controls.id = operation_control_id
        and controls.control_number = 14
        and controls.balance_before_cents = 750492
        and controls.balance_after_cents = 711002
        and controls.operating_result_cents = -39490
    )
  then raise exception 'Lorena repaired broker chain failed integrity validation'; end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id, 'periods', target_period_id, 'lorena_gino_burn_chain_repaired',
    jsonb_build_object(
      'removed_stale_accounts', stale_account_ids,
      'backup_schema', 'private_lorena_gino_repair_20261103',
      'gino_burned_accounts', burned_account_ids,
      'gino_broker_result_cents', 65426,
      'gino_daily_control_id', burn_control_id,
      'committed_lucid_lore_batch_id', target_batch_id,
      'lucid_lore_daily_control_id', operation_control_id,
      'final_broker_balance_cents', 711002
    ),
    'Corrección solicitada por Mauricio: retirar dos residuos históricos, registrar la quema Lucid Gino y liberar la conciliación posterior'
  );
end;
$repair$;

commit;
