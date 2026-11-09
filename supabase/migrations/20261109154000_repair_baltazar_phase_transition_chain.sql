-- Reconstruye sólo el tramo comprobado de Baltazar afectado por el cambio
-- Evaluation -> Funded del 30/10. Cada control se deriva de una sesión broker
-- cerrada y de cinco sesiones prop simultáneas; no se inventan operaciones.

begin;

do $repair$
declare
  baltazar_id constant uuid := '42c42ea2-c9a9-41c6-8604-5804982c1f50';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_period_id constant uuid := 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb';
  target_company_id constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  target_connector_id constant uuid := '4d539f74-3b6d-48c9-85a1-3349548db500';
  plan record;
  control_id uuid;
  leader_id uuid;
  members_count integer;
  changed_count integer;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'ninja_operation_batches'
      and events.entity_id = '9c6a58f3-b07f-434b-8cf9-c7cf5e79fdf6'::uuid
      and events.action = 'phase_transition_chain_repaired'
  ) then
    return;
  end if;

  -- The existing ledger is the exact anchor immediately before the fault.
  if not exists (
    select 1 from public.daily_controls controls
    where controls.id = '2a640cb0-09c3-4e0f-992e-41786bd79ce6'::uuid
      and controls.period_id = target_period_id
      and controls.control_number = 6
      and controls.balance_before_cents = 964580
      and controls.balance_after_cents = 911006
      and controls.operating_result_cents = -53574
  ) then
    raise exception 'Baltazar repair anchor changed; aborting';
  end if;

  if (
    select count(*) from public.daily_controls controls
    where controls.period_id = target_period_id
      and (controls.control_number, controls.balance_before_cents, controls.balance_after_cents) in (
        (7, 911006, 858932), (8, 858932, 867858), (9, 867858, 801284)
      )
  ) <> 3 then
    raise exception 'Baltazar later control anchor changed; aborting';
  end if;

  -- No target can be reconciled twice or silently overwrite a later repair.
  if exists (
    select 1 from public.ninja_operation_batches batches
    where batches.id in (
      '9c6a58f3-b07f-434b-8cf9-c7cf5e79fdf6'::uuid,
      '8a41ae03-3674-4416-9d67-91de53ecdc9e'::uuid,
      '5c3fab97-3346-4f38-94ae-75b9e609376a'::uuid,
      'fa3f8048-d29b-4ace-8ab2-965ccd6b8321'::uuid,
      '01089cc3-94da-4606-980c-3a9c6d4d1e2a'::uuid
    ) and batches.accounting_status = 'committed'
  ) then
    raise exception 'At least one Baltazar target batch was already reconciled';
  end if;

  if exists (
    select 1 from public.daily_controls controls
    where controls.period_id = target_period_id
      and controls.source = 'ninjatrader'
      and controls.source_event_key in (
        'ninja-operation:878905', 'ninja-operation:879391',
        'ninja-operation:900589', 'ninja-operation:903714', 'ninja-operation:965822'
      )
  ) then
    raise exception 'A Baltazar source event is already present in the ledger';
  end if;

  -- The fault must still be the documented transition race: the five old LFE
  -- sessions predate their phase-transition closure, while the broker session
  -- began in the same operational window.
  if (
    select count(*)
    from public.ninja_operation_probe_sessions sessions
    join public.ninja_account_links links
      on links.connector_id = sessions.connector_id
      and links.connection_name = sessions.connection_name
      and links.external_account_name = sessions.account_name
      and links.closure_reason = 'phase_transition'
      and links.first_seen_at <= sessions.opened_at
      and links.closed_at >= sessions.opened_at
    join public.accounts accounts on accounts.id = links.account_id
    where sessions.id in (2694719, 2694723, 2694725, 2694730, 2694733)
      and sessions.connector_id = target_connector_id
      and sessions.status = 'closed'
      and sessions.direction = 'Short'
      and sessions.quantity = 3
      and sessions.instruments = array['NQ DEC26']::text[]
      and sessions.result = 1519.5
      and accounts.period_id = target_period_id
      and accounts.company_id = target_company_id
  ) <> 5 then
    raise exception 'Baltazar phase-transition evidence changed; aborting';
  end if;

  if not exists (
    select 1 from public.ninja_operation_probe_sessions sessions
    where sessions.id = 2694899
      and sessions.connector_id = target_connector_id
      and sessions.connection_name = 'Live'
      and sessions.account_name = '2234971'
      and sessions.opening_balance = 9110.06
      and sessions.closing_balance = 8058.58
      and sessions.result = -1051.48
  ) then
    raise exception 'Baltazar root broker session changed; aborting';
  end if;

  -- Root batch contained its broker leg only. Restore the five verified prop
  -- members from the historical links, preserving the app's equal rounding.
  if (
    select count(*) from public.ninja_operation_batch_members
    where batch_id = '9c6a58f3-b07f-434b-8cf9-c7cf5e79fdf6'::uuid
  ) <> 1 then
    raise exception 'Baltazar root batch members changed; aborting';
  end if;

  insert into public.ninja_operation_batch_members(
    batch_id, session_id, account_id, role, allocated_broker_result_cents
  )
  select '9c6a58f3-b07f-434b-8cf9-c7cf5e79fdf6'::uuid,
    sessions.id, links.account_id, 'prop', -21030
  from public.ninja_operation_probe_sessions sessions
  join public.ninja_account_links links
    on links.connector_id = sessions.connector_id
    and links.connection_name = sessions.connection_name
    and links.external_account_name = sessions.account_name
    and links.closure_reason = 'phase_transition'
    and links.first_seen_at <= sessions.opened_at
    and links.closed_at >= sessions.opened_at
  where sessions.id in (2694719, 2694723, 2694725, 2694730, 2694733);
  get diagnostics changed_count = row_count;
  if changed_count <> 5 then
    raise exception 'Expected five historical Baltazar prop members, inserted %', changed_count;
  end if;

  update public.ninja_operation_batches
  set context_prop_count = 5,
      distributed_cents = -105150,
      rounding_difference_cents = -2,
      updated_at = now()
  where id = '9c6a58f3-b07f-434b-8cf9-c7cf5e79fdf6'::uuid;

  -- Make room between the last valid control and the first later committed one.
  update public.daily_controls
  set control_number = control_number + 100
  where period_id = target_period_id and control_number >= 7;
  update public.daily_controls
  set control_number = control_number - 95
  where period_id = target_period_id and control_number >= 107;

  -- These controls had the correct executed result but retained the stale
  -- pre-fault balance. Their received broker balances prove the real chain.
  update public.daily_controls
  set balance_before_cents = 1166410,
      balance_after_cents = 1114336,
      received_balance_cents = 1114336,
      sync_issue_reason = null,
      updated_by = baltazar_id
  where id = '4f040ebb-5534-4f7c-964f-4e0f8c1402f7'::uuid;
  update public.daily_controls
  set balance_before_cents = 1114336,
      balance_after_cents = 1123262,
      received_balance_cents = 1123262,
      sync_issue_reason = null,
      updated_by = baltazar_id
  where id = '839bd766-94a8-4fc1-ab31-5311bf96a2d7'::uuid;
  update public.daily_controls
  set balance_before_cents = 1123262,
      balance_after_cents = 1056688,
      received_balance_cents = 1056688,
      sync_issue_reason = null,
      updated_by = baltazar_id
  where id = '1a6f61dd-65d2-46e7-a085-c52a3c231198'::uuid;

  for plan in
    select * from (values
      (7,  '9c6a58f3-b07f-434b-8cf9-c7cf5e79fdf6'::uuid, 2694899::bigint, '2026-10-30'::date, 'Evaluacion'::public.operation_phase,  911006::bigint,  805858::bigint),
      (8,  '8a41ae03-3674-4416-9d67-91de53ecdc9e'::uuid, 2697968::bigint, '2026-10-30'::date, 'Primera vuelta'::public.operation_phase, 805858::bigint, 775658::bigint),
      (9,  '5c3fab97-3346-4f38-94ae-75b9e609376a'::uuid, 2776287::bigint, '2026-11-02'::date, 'Primera vuelta'::public.operation_phase, 775658::bigint, 1031558::bigint),
      (10, 'fa3f8048-d29b-4ace-8ab2-965ccd6b8321'::uuid, 2788565::bigint, '2026-11-02'::date, 'Evaluacion'::public.operation_phase, 1031558::bigint, 1098484::bigint),
      (11, '01089cc3-94da-4606-980c-3a9c6d4d1e2a'::uuid, 2931491::bigint, '2026-11-03'::date, 'Evaluacion'::public.operation_phase, 1098484::bigint, 1166410::bigint)
    ) as planned(control_number, batch_id, broker_session_id, operated_on, phase, balance_before_cents, balance_after_cents)
  loop
    select count(*) into members_count
    from public.ninja_operation_batch_members members
    where members.batch_id = plan.batch_id and members.role = 'prop';
    if members_count <> 5 then
      raise exception 'Baltazar batch % does not have five verified prop members', plan.batch_id;
    end if;

    if not exists (
      select 1 from public.ninja_operation_batches batches
      join public.ninja_operation_probe_sessions sessions on sessions.id = batches.broker_session_id
      where batches.id = plan.batch_id
        and batches.connector_id = target_connector_id
        and batches.broker_session_id = plan.broker_session_id
        and batches.broker_result_cents = plan.balance_after_cents - plan.balance_before_cents
        and sessions.opening_balance * 100 = plan.balance_before_cents
        and sessions.closing_balance * 100 = plan.balance_after_cents
    ) then
      raise exception 'Baltazar batch % no longer matches its broker evidence', plan.batch_id;
    end if;

    select members.account_id into leader_id
    from public.ninja_operation_batch_members members
    join public.accounts accounts on accounts.id = members.account_id
    where members.batch_id = plan.batch_id and members.role = 'prop'
    order by accounts.reference_number, members.account_id
    limit 1;

    insert into public.daily_controls(
      period_id, control_number, operated_on, kind, balance_before_cents,
      balance_after_cents, operating_result_cents, company_id, leader_account_id,
      phase, observations, source, source_event_key, received_balance_cents,
      sync_issue_reason, confirmation_key, created_by
    )
    select target_period_id, plan.control_number, plan.operated_on, 'balance_update',
      plan.balance_before_cents, plan.balance_after_cents,
      plan.balance_after_cents - plan.balance_before_cents, target_company_id, leader_id,
      plan.phase, 'Reconstrucción auditada de cobertura recibida desde NinjaTrader.',
      'ninjatrader', 'ninja-operation:' || sessions.opening_event_id::text,
      plan.balance_after_cents, null, plan.batch_id, baltazar_id
    from public.ninja_operation_probe_sessions sessions
    where sessions.id = plan.broker_session_id
    returning id into control_id;

    insert into public.daily_control_participants(
      daily_control_id, period_id, account_id, role, allocated_result_cents
    )
    select control_id, target_period_id, members.account_id,
      case when members.account_id = leader_id then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,
      members.allocated_broker_result_cents
    from public.ninja_operation_batch_members members
    where members.batch_id = plan.batch_id and members.role = 'prop';

    insert into public.operation_entries(
      period_id, daily_control_id, account_id, operated_on, phase,
      participant_role, destination, magnitude_cents, created_by
    )
    select target_period_id, control_id, members.account_id, plan.operated_on, plan.phase,
      case when members.account_id = leader_id then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,
      case when members.allocated_broker_result_cents > 0 then 'NETO BROKER +'::public.broker_result_destination else 'NETO BROKER -'::public.broker_result_destination end,
      abs(members.allocated_broker_result_cents), baltazar_id
    from public.ninja_operation_batch_members members
    where members.batch_id = plan.batch_id and members.role = 'prop';

    update public.ninja_operation_batches
    set status = 'ready', accounting_mode = 'active', accounting_status = 'committed',
      accounting_blocking_reason = null, accounting_period_id = target_period_id,
      accounting_company_id = target_company_id, accounting_phase = plan.phase,
      operated_on = plan.operated_on, daily_control_id = control_id,
      distributed_cents = (select sum(allocated_broker_result_cents) from public.ninja_operation_batch_members where batch_id = plan.batch_id and role = 'prop'),
      rounding_difference_cents = (select sum(allocated_broker_result_cents) from public.ninja_operation_batch_members where batch_id = plan.batch_id and role = 'prop') - broker_result_cents,
      updated_at = now()
    where id = plan.batch_id;

    update public.ninja_broker_balance_events events
    set status = 'confirmed', daily_control_id = control_id, resolved_at = coalesce(events.resolved_at, now())
    where events.connector_id = target_connector_id
      and events.source_event_id = (
        select 'ninja-operation:' || sessions.opening_event_id::text
        from public.ninja_operation_probe_sessions sessions where sessions.id = plan.broker_session_id
      );
  end loop;

  -- The rebuilt chain must now agree with every already-committed later control.
  if exists (
    select 1
    from public.daily_controls controls
    join public.daily_controls previous
      on previous.period_id = controls.period_id
      and previous.control_number = controls.control_number - 1
    where controls.period_id = target_period_id
      and controls.balance_before_cents <> previous.balance_after_cents
  ) then
    raise exception 'Baltazar repair would leave an inconsistent control chain';
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id,
    'ninja_operation_batches',
    '9c6a58f3-b07f-434b-8cf9-c7cf5e79fdf6'::uuid,
    'phase_transition_chain_repaired',
    jsonb_build_object(
      'batch_ids', jsonb_build_array(
        '9c6a58f3-b07f-434b-8cf9-c7cf5e79fdf6',
        '8a41ae03-3674-4416-9d67-91de53ecdc9e',
        '5c3fab97-3346-4f38-94ae-75b9e609376a',
        'fa3f8048-d29b-4ace-8ab2-965ccd6b8321',
        '01089cc3-94da-4606-980c-3a9c6d4d1e2a'
      ),
      'root_prop_session_ids', jsonb_build_array(2694719, 2694723, 2694725, 2694730, 2694733),
      'reason', 'Las cinco sesiones prop ocurrieron antes del cambio de fase Evaluation a Funded.'
    ),
    'Reparación cronológica: el cambio de fase posterior ocultó la cobertura original y bloqueó la continuidad de saldo.'
  );
end;
$repair$;

commit;
