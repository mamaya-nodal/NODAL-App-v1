-- Reconstruye las ocho operaciones de Baltazar posteriores al control 14.
-- Conserva sin cambios el trade ya conciliado de US$ 89,26 y las cuentas
-- cerradas que participaron en él. La evidencia combina Cash History del
-- broker, sesiones técnicas, inventario de Alanis y asignación confirmada.

begin;

create schema if not exists private_baltazar_identity_repair_20261110;
revoke all on schema private_baltazar_identity_repair_20261110 from public, anon, authenticated;

create table if not exists private_baltazar_identity_repair_20261110.daily_controls as
select * from public.daily_controls
where period_id = 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid;

create table if not exists private_baltazar_identity_repair_20261110.ninja_operation_batches as
select * from public.ninja_operation_batches
where id = any(array[
  '10a883bf-2eb7-48bf-b8fe-54af212991b3'::uuid,
  '163f61fd-4400-49be-ac56-8a1e25910fb8'::uuid,
  '4eab3cfc-e959-47fe-a6a2-455819216fe0'::uuid,
  'e2c8ad17-c93c-45fa-9d7a-4ec8c72c39b0'::uuid,
  '325f8c40-e81e-4922-8386-ad550fc2fa0c'::uuid,
  '8ea33a8d-efd1-4c99-897e-4d6d3f3c5b57'::uuid,
  '7df81b27-3308-450c-92ad-64c59e12442c'::uuid,
  '972f7921-1e6c-47c9-82bb-144768b9e736'::uuid
]);

create table if not exists private_baltazar_identity_repair_20261110.ninja_operation_probe_sessions as
select * from public.ninja_operation_probe_sessions
where id = any(array[3032621,3069803,3132902,3134702,3199269,3263184,3316931,3327405]::bigint[]);

create table if not exists private_baltazar_identity_repair_20261110.ninja_operation_batch_members as
select members.* from public.ninja_operation_batch_members members
where members.batch_id in (select id from private_baltazar_identity_repair_20261110.ninja_operation_batches);

create table if not exists private_baltazar_identity_repair_20261110.ninja_operation_batch_manual_accounts as
select manual.* from public.ninja_operation_batch_manual_accounts manual
where manual.batch_id in (select id from private_baltazar_identity_repair_20261110.ninja_operation_batches);

create table if not exists private_baltazar_identity_repair_20261110.ninja_broker_balance_events as
select events.* from public.ninja_broker_balance_events events
where events.connector_id = '4d539f74-3b6d-48c9-85a1-3349548db500'::uuid
  and events.source_event_id in (
    select 'ninja-operation:' || sessions.opening_event_id::text
    from private_baltazar_identity_repair_20261110.ninja_operation_probe_sessions sessions
  );

do $repair$
declare
  owner_id constant uuid := '42c42ea2-c9a9-41c6-8604-5804982c1f50';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_period_id constant uuid := 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb';
  target_company_id constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  personal_connector_id constant uuid := '4d539f74-3b6d-48c9-85a1-3349548db500';
  alanis_connector_id constant uuid := '6e20a588-0a54-4953-b6a3-36b899ff54a7';
  alanis_identity_id constant uuid := '847099d3-ce28-44c3-b0e1-1a90a556b04c';
  leandro_connector_id constant uuid := '054ac7da-bcc8-40e6-82ba-cf5200ec4ce5';
  leandro_identity_id constant uuid := 'c20607b9-7e4c-4eb2-92d9-ece832dc36db';
  plan record;
  control_id uuid;
  leader_id uuid;
  participant_count integer;
  distributed bigint;
  expected_result bigint;
  changed_count integer;
begin
  if exists (
    select 1 from public.audit_events
    where entity_table = 'periods'
      and entity_id = target_period_id
      and action = 'baltazar_identity_telemetry_chain_repaired'
  ) then return; end if;

  -- El trade de US$ 89,26 y las cuentas cerradas permanecen exactamente como
  -- están. El control 14 es el único ancla admitida para esta reparación.
  if (select count(*) from public.daily_controls where period_id = target_period_id) <> 14
    or not exists (
      select 1 from public.daily_controls controls
      where controls.id = '1a6f61dd-65d2-46e7-a085-c52a3c231198'::uuid
        and controls.period_id = target_period_id
        and controls.control_number = 14
        and controls.balance_before_cents = 1123262
        and controls.balance_after_cents = 1056688
        and controls.operating_result_cents = -66574
    )
  then raise exception 'Baltazar repair anchor changed; aborting'; end if;

  -- Alanis estaba registrada y asignada antes de las operaciones. La versión
  -- 0.16 conservó inventario pero no emitió Execution/Position, por lo que la
  -- cobertura se reconstruye desde los cambios de sus cinco saldos.
  if (
    select count(*)
    from public.ninja_account_links links
    join public.identity_account_assignments assignments
      on assignments.account_id = links.account_id and assignments.unassigned_at is null
    where links.connector_id = alanis_connector_id
      and assignments.identity_id = alanis_identity_id
      and links.external_account_name in (
        'LFE05098109210001','LFE05098109210002','LFE05098109210003','LFE05098109210004','LFE05098109210005'
      )
      and links.closed_at is not null and links.closure_reason = 'phase_transition'
  ) <> 5 or (
    select count(*)
    from public.ninja_account_links links
    join public.identity_account_assignments assignments
      on assignments.account_id = links.account_id and assignments.unassigned_at is null
    where links.connector_id = alanis_connector_id
      and assignments.identity_id = alanis_identity_id
      and links.external_account_name in (
        'LFF05098109210001','LFF05098109210002','LFF05098109210003','LFF05098109210004','LFF05098109210005'
      )
      and links.closed_at is null
  ) <> 5
  then raise exception 'Alanis account evidence changed; aborting'; end if;

  -- Leandro fue registrado después del trade del 06/11. Las cinco cuentas
  -- actuales son las confirmadas y su alta ya absorbió el primer día.
  if (
    select count(*)
    from public.ninja_account_links links
    join public.identity_account_assignments assignments
      on assignments.account_id = links.account_id and assignments.unassigned_at is null
    where links.connector_id = leandro_connector_id
      and assignments.identity_id = leandro_identity_id
      and links.external_account_name in (
        'LFE05098517240001','LFE05098517240002','LFE05098517240003','LFE05098517240004','LFE05098517240005'
      )
      and links.closed_at is null and links.completed_trade_days = 1
  ) <> 5
  then raise exception 'Leandro account evidence changed; aborting'; end if;

  -- Cash History demuestra que la sesión 3199269 comenzó después de que Ninja
  -- descontara el primer Exchange Fee de US$ 1,05. Se corrige la evidencia
  -- derivada, conservando la fila original en el esquema privado anterior.
  if not exists (
    select 1 from public.ninja_operation_probe_sessions sessions
    join public.ninja_operation_batches batches on batches.broker_session_id = sessions.id
    where sessions.id = 3199269 and sessions.status = 'closed'
      and round(sessions.opening_balance * 100)::bigint = 773737
      and round(sessions.closing_balance * 100)::bigint = 331542
      and round(sessions.result * 100)::bigint = -442195
      and batches.id = '325f8c40-e81e-4922-8386-ad550fc2fa0c'::uuid
      and batches.broker_result_cents = -442195
  ) then raise exception 'Baltazar 06/11 fee evidence changed; aborting'; end if;

  update public.ninja_operation_probe_sessions
  set opening_balance = 7738.42, result = -4423.00
  where id = 3199269;
  update public.ninja_operation_batches
  set broker_result_cents = -442300, updated_at = now()
  where id = '325f8c40-e81e-4922-8386-ad550fc2fa0c'::uuid;

  for plan in
    select * from (values
      (15, '10a883bf-2eb7-48bf-b8fe-54af212991b3'::uuid, 3032621::bigint, '2026-11-04'::date, 'Evaluacion'::public.operation_phase, 1056688::bigint, 944540::bigint, 'alanis_e2'::text),
      (16, '163f61fd-4400-49be-ac56-8a1e25910fb8'::uuid, 3069803::bigint, '2026-11-04'::date, 'Primera vuelta'::public.operation_phase, 944540::bigint, 913390::bigint, 'alanis_f1'::text),
      (17, '4eab3cfc-e959-47fe-a6a2-455819216fe0'::uuid, 3132902::bigint, '2026-11-05'::date, 'Evaluacion'::public.operation_phase, 913390::bigint, 806242::bigint, 'observed_1105_a'::text),
      (18, 'e2c8ad17-c93c-45fa-9d7a-4ec8c72c39b0'::uuid, 3134702::bigint, '2026-11-05'::date, 'Evaluacion'::public.operation_phase, 806242::bigint, 773842::bigint, 'observed_1105_b'::text),
      (19, '325f8c40-e81e-4922-8386-ad550fc2fa0c'::uuid, 3199269::bigint, '2026-11-06'::date, 'Primera vuelta'::public.operation_phase, 773842::bigint, 331542::bigint, 'alanis_f2'::text),
      (20, '8ea33a8d-efd1-4c99-897e-4d6d3f3c5b57'::uuid, 3263184::bigint, '2026-11-06'::date, 'Evaluacion'::public.operation_phase, 331542::bigint, 298468::bigint, 'leandro_e1'::text),
      (21, '7df81b27-3308-450c-92ad-64c59e12442c'::uuid, 3316931::bigint, '2026-11-09'::date, 'Primera vuelta'::public.operation_phase, 298468::bigint, 268456::bigint, 'alanis_f3_first'::text),
      (22, '972f7921-1e6c-47c9-82bb-144768b9e736'::uuid, 3327405::bigint, '2026-11-09'::date, 'Primera vuelta'::public.operation_phase, 268456::bigint, 248648::bigint, 'alanis_f3_second'::text)
    ) as planned(control_number,batch_id,broker_session_id,operated_on,phase,balance_before_cents,balance_after_cents,group_key)
  loop
    expected_result := plan.balance_after_cents - plan.balance_before_cents;
    if not exists (
      select 1
      from public.ninja_operation_batches batches
      join public.ninja_operation_probe_sessions sessions on sessions.id = batches.broker_session_id
      where batches.id = plan.batch_id
        and batches.connector_id = personal_connector_id
        and batches.broker_session_id = plan.broker_session_id
        and batches.broker_result_cents = expected_result
        and round(sessions.result * 100)::bigint = expected_result
        and sessions.status = 'closed'
        and round(sessions.closing_balance * 100)::bigint = plan.balance_after_cents
    ) then raise exception 'Broker evidence changed for batch %', plan.batch_id; end if;

    if plan.group_key in ('alanis_e2','alanis_f1','alanis_f2','alanis_f3_first','alanis_f3_second') then
      delete from public.ninja_operation_batch_manual_accounts where batch_id = plan.batch_id;
      insert into public.ninja_operation_batch_manual_accounts(batch_id,account_id,allocated_broker_result_cents,created_by)
      select plan.batch_id, links.account_id,
        case plan.group_key
          when 'alanis_e2' then case when right(links.external_account_name,5) in ('10001','10002','10003') then -22430 else -22429 end
          when 'alanis_f1' then -6230
          when 'alanis_f2' then -88460
          when 'alanis_f3_first' then -10004
          when 'alanis_f3_second' then -9904
        end,
        owner_id
      from public.ninja_account_links links
      where links.connector_id = alanis_connector_id
        and (
          (plan.group_key = 'alanis_e2'
            and links.external_account_name in ('LFE05098109210001','LFE05098109210002','LFE05098109210003','LFE05098109210004','LFE05098109210005')
            and links.closed_at is not null and links.closure_reason = 'phase_transition')
          or (plan.group_key in ('alanis_f1','alanis_f2')
            and links.external_account_name in ('LFF05098109210001','LFF05098109210002','LFF05098109210003','LFF05098109210004','LFF05098109210005')
            and links.closed_at is null)
          or (plan.group_key = 'alanis_f3_first'
            and links.external_account_name in ('LFF05098109210001','LFF05098109210002','LFF05098109210003')
            and links.closed_at is null)
          or (plan.group_key = 'alanis_f3_second'
            and links.external_account_name in ('LFF05098109210004','LFF05098109210005')
            and links.closed_at is null)
        );
      get diagnostics changed_count = row_count;
      if changed_count <> (case when plan.group_key = 'alanis_f3_first' then 3 when plan.group_key = 'alanis_f3_second' then 2 else 5 end)
      then raise exception 'Unexpected Alanis participant count for %', plan.group_key; end if;
    elsif plan.group_key = 'leandro_e1' then
      delete from public.ninja_operation_batch_manual_accounts where batch_id = plan.batch_id;
      insert into public.ninja_operation_batch_manual_accounts(batch_id,account_id,allocated_broker_result_cents,created_by)
      select plan.batch_id, links.account_id,
        case when links.external_account_name = 'LFE05098517240001' then -6614 else -6615 end,
        owner_id
      from public.ninja_account_links links
      where links.connector_id = leandro_connector_id
        and links.external_account_name in ('LFE05098517240001','LFE05098517240002','LFE05098517240003','LFE05098517240004','LFE05098517240005')
        and links.closed_at is null;
      get diagnostics changed_count = row_count;
      if changed_count <> 5 then raise exception 'Unexpected Leandro participant count'; end if;
    end if;

    if plan.group_key in ('observed_1105_a','observed_1105_b') then
      select count(*),coalesce(sum(allocated_broker_result_cents),0)
      into participant_count,distributed
      from public.ninja_operation_batch_members where batch_id = plan.batch_id and role = 'prop';
    else
      select count(*),coalesce(sum(allocated_broker_result_cents),0)
      into participant_count,distributed
      from public.ninja_operation_batch_manual_accounts where batch_id = plan.batch_id;
    end if;
    if participant_count = 0 or abs(distributed - expected_result) > participant_count
    then raise exception 'Participant distribution does not reconcile for %', plan.group_key; end if;

    if plan.group_key in ('observed_1105_a','observed_1105_b') then
      select members.account_id into leader_id
      from public.ninja_operation_batch_members members
      join public.accounts accounts on accounts.id = members.account_id
      where members.batch_id = plan.batch_id and members.role = 'prop'
      order by accounts.reference_number limit 1;
    else
      select manual.account_id into leader_id
      from public.ninja_operation_batch_manual_accounts manual
      join public.accounts accounts on accounts.id = manual.account_id
      where manual.batch_id = plan.batch_id
      order by accounts.reference_number limit 1;
    end if;

    insert into public.daily_controls(
      period_id,control_number,operated_on,kind,balance_before_cents,balance_after_cents,operating_result_cents,
      company_id,leader_account_id,phase,observations,source,source_event_key,received_balance_cents,confirmation_key,created_by
    )
    select target_period_id,plan.control_number,plan.operated_on,'balance_update',plan.balance_before_cents,plan.balance_after_cents,
      expected_result,target_company_id,leader_id,plan.phase,
      case when plan.group_key = 'alanis_f2'
        then 'Reconstrucción auditada; Cash History incorporó el Exchange Fee inicial de US$ 1,05 omitido por la sesión técnica.'
        else 'Reconstrucción auditada de cobertura confirmada por sesiones o inventario NinjaTrader.' end,
      'ninjatrader','ninja-operation:'||sessions.opening_event_id::text,plan.balance_after_cents,plan.batch_id,owner_id
    from public.ninja_operation_probe_sessions sessions where sessions.id = plan.broker_session_id
    returning id into control_id;

    if plan.group_key in ('observed_1105_a','observed_1105_b') then
      insert into public.daily_control_participants(daily_control_id,period_id,account_id,role,allocated_result_cents)
      select control_id,target_period_id,members.account_id,
        case when members.account_id = leader_id then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,
        members.allocated_broker_result_cents
      from public.ninja_operation_batch_members members
      where members.batch_id = plan.batch_id and members.role = 'prop';
    else
      insert into public.daily_control_participants(daily_control_id,period_id,account_id,role,allocated_result_cents)
      select control_id,target_period_id,manual.account_id,
        case when manual.account_id = leader_id then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,
        manual.allocated_broker_result_cents
      from public.ninja_operation_batch_manual_accounts manual where manual.batch_id = plan.batch_id;
    end if;

    insert into public.operation_entries(period_id,daily_control_id,account_id,operated_on,phase,participant_role,destination,magnitude_cents,created_by)
    select participants.period_id,participants.daily_control_id,participants.account_id,plan.operated_on,plan.phase,participants.role,
      case when participants.allocated_result_cents > 0 then 'NETO BROKER +'::public.broker_result_destination else 'NETO BROKER -'::public.broker_result_destination end,
      abs(participants.allocated_result_cents),owner_id
    from public.daily_control_participants participants where participants.daily_control_id = control_id;

    update public.ninja_operation_batches
    set status='ready',accounting_mode='active',accounting_status='committed',accounting_blocking_reason=null,
      accounting_period_id=target_period_id,accounting_company_id=target_company_id,accounting_phase=plan.phase,
      operated_on=plan.operated_on,daily_control_id=control_id,context_prop_count=participant_count,
      distributed_cents=distributed,rounding_difference_cents=distributed-broker_result_cents,updated_at=now()
    where id = plan.batch_id;

    update public.ninja_broker_balance_events events
    set status='confirmed',daily_control_id=control_id,resolved_at=coalesce(resolved_at,now())
    where events.connector_id=personal_connector_id and events.source_event_id=(
      select 'ninja-operation:'||opening_event_id::text from public.ninja_operation_probe_sessions where id=plan.broker_session_id
    );
  end loop;

  -- El alta tardía de Leandro ya incorporaba el día reconstruido. Al existir
  -- ahora su asiento histórico, el baseline vuelve a cero para no duplicarlo.
  update public.ninja_account_links
  set completed_trade_days=0
  where connector_id=leandro_connector_id
    and external_account_name in ('LFE05098517240001','LFE05098517240002','LFE05098517240003','LFE05098517240004','LFE05098517240005')
    and completed_trade_days=1;
  get diagnostics changed_count = row_count;
  if changed_count <> 5 then raise exception 'Leandro baseline changed; aborting'; end if;

  if (select count(*) from public.daily_controls where period_id=target_period_id) <> 22
    or not exists (
      select 1 from public.daily_controls
      where period_id=target_period_id and control_number=22 and balance_after_cents=248648 and operating_result_cents=-19808
    )
    or exists (
      select 1 from public.daily_controls current_control
      join public.daily_controls previous_control
        on previous_control.period_id=current_control.period_id
       and previous_control.control_number=current_control.control_number-1
      where current_control.period_id=target_period_id
        and current_control.balance_before_cents<>previous_control.balance_after_cents
    )
  then raise exception 'Baltazar repair would leave an invalid control chain'; end if;

  if (select count(*) from public.ninja_operation_batches
      where id = any(array[
        '10a883bf-2eb7-48bf-b8fe-54af212991b3'::uuid,'163f61fd-4400-49be-ac56-8a1e25910fb8'::uuid,
        '4eab3cfc-e959-47fe-a6a2-455819216fe0'::uuid,'e2c8ad17-c93c-45fa-9d7a-4ec8c72c39b0'::uuid,
        '325f8c40-e81e-4922-8386-ad550fc2fa0c'::uuid,'8ea33a8d-efd1-4c99-897e-4d6d3f3c5b57'::uuid,
        '7df81b27-3308-450c-92ad-64c59e12442c'::uuid,'972f7921-1e6c-47c9-82bb-144768b9e736'::uuid
      ]) and accounting_status='committed' and accounting_blocking_reason is null) <> 8
  then raise exception 'Baltazar repair did not commit all eight batches'; end if;

  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(admin_id,'periods',target_period_id,'baltazar_identity_telemetry_chain_repaired',
    jsonb_build_object(
      'controls_added',jsonb_build_array(15,16,17,18,19,20,21,22),
      'final_balance_cents',248648,
      'unchanged_historical_trade_cents',8926,
      'corrected_session_id',3199269,
      'corrected_session_result_cents',-442300,
      'source','Cash History + Ninja inventory + confirmed identity assignment'
    ),
    'Reparación cronológica de ocho operaciones cubiertas; el trade histórico de US$ 89,26 y sus cuentas cerradas permanecieron intactos.');
end;
$repair$;

commit;
