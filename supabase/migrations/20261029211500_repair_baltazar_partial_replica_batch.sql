-- El lote de Baltazar del 29/10 se confirmó al recibir la primera de cinco
-- réplicas casi simultáneas. Se agregan las cuatro participaciones faltantes
-- sin reescribir el saldo broker ni crear un segundo control diario.

begin;

do $repair$
declare
  baltazar_id constant uuid := '42c42ea2-c9a9-41c6-8604-5804982c1f50';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_batch_id constant uuid := '31f1c4fd-0f15-4ea2-a5c1-9bfcd7d46fab';
  target_control_id constant uuid := '2a640cb0-09c3-4e0f-992e-41786bd79ce6';
  target_period_id constant uuid := 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb';
  target_company_id constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  per_account_cents constant bigint := -10715;
  changed_count integer;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'ninja_operation_batches'
      and events.entity_id = target_batch_id
      and events.action = 'partial_replica_batch_repaired'
  ) then
    return;
  end if;

  if not exists (
    select 1
    from public.ninja_operation_batches batches
    where batches.id = target_batch_id
      and batches.accounting_status = 'committed'
      and batches.daily_control_id = target_control_id
      and batches.broker_result_cents = -53574
  ) then
    raise exception 'Baltazar committed batch changed; aborting controlled repair';
  end if;

  if not exists (
    select 1
    from public.daily_controls controls
    where controls.id = target_control_id
      and controls.period_id = target_period_id
      and controls.control_number = 6
      and controls.phase = 'Evaluacion'
      and controls.balance_before_cents = 964580
      and controls.balance_after_cents = 911006
      and controls.operating_result_cents = -53574
  ) then
    raise exception 'Baltazar control continuity changed; aborting controlled repair';
  end if;

  if (
    select count(*)
    from public.ninja_operation_probe_sessions sessions
    join public.ninja_account_links links
      on links.connector_id = sessions.connector_id
      and links.connection_name = sessions.connection_name
      and links.external_account_name = sessions.account_name
      and links.closed_at is null
    join public.accounts accounts on accounts.id = links.account_id
    where sessions.id in (2626279, 2626244, 2626211, 2626318, 2626283)
      and sessions.status = 'closed'
      and sessions.direction = 'Short'
      and sessions.quantity = 3
      and sessions.instruments = array['NQ DEC26']::text[]
      and sessions.result = 1519.5
      and accounts.period_id = target_period_id
      and accounts.company_id = target_company_id
  ) <> 5 then
    raise exception 'Expected five compatible Baltazar prop sessions';
  end if;

  if exists (
    select 1
    from public.ninja_operation_batch_members members
    where members.session_id in (2626279, 2626244, 2626318, 2626283)
  ) then
    raise exception 'A missing Baltazar session already belongs to another batch';
  end if;

  update public.ninja_operation_batches
  set distributed_cents = per_account_cents * 5,
      rounding_difference_cents = (per_account_cents * 5) - broker_result_cents,
      context_prop_count = 5,
      updated_at = now()
  where id = target_batch_id;

  update public.ninja_operation_batch_members
  set allocated_broker_result_cents = per_account_cents
  where batch_id = target_batch_id and session_id = 2626211 and role = 'prop';
  if not found then raise exception 'Original Baltazar prop member is missing'; end if;

  insert into public.ninja_operation_batch_members(
    batch_id, session_id, account_id, role, allocated_broker_result_cents
  )
  select target_batch_id, sessions.id, links.account_id, 'prop', per_account_cents
  from public.ninja_operation_probe_sessions sessions
  join public.ninja_account_links links
    on links.connector_id = sessions.connector_id
    and links.connection_name = sessions.connection_name
    and links.external_account_name = sessions.account_name
    and links.closed_at is null
  where sessions.id in (2626279, 2626244, 2626318, 2626283);
  get diagnostics changed_count = row_count;
  if changed_count <> 4 then
    raise exception 'Expected four missing Baltazar batch members, inserted %', changed_count;
  end if;

  update public.daily_control_participants
  set allocated_result_cents = per_account_cents
  where daily_control_id = target_control_id
    and account_id = '07fc535b-1819-4c1b-8bc9-e6b903d729c5'::uuid;
  if not found then raise exception 'Original Baltazar control participant is missing'; end if;

  insert into public.daily_control_participants(
    daily_control_id, period_id, account_id, role, allocated_result_cents
  )
  select target_control_id, target_period_id, links.account_id,
    'replica'::public.daily_control_participant_role, per_account_cents
  from public.ninja_operation_probe_sessions sessions
  join public.ninja_account_links links
    on links.connector_id = sessions.connector_id
    and links.connection_name = sessions.connection_name
    and links.external_account_name = sessions.account_name
    and links.closed_at is null
  where sessions.id in (2626279, 2626244, 2626318, 2626283);

  update public.operation_entries
  set magnitude_cents = abs(per_account_cents)
  where daily_control_id = target_control_id
    and account_id = '07fc535b-1819-4c1b-8bc9-e6b903d729c5'::uuid
    and destination = 'NETO BROKER -';
  if not found then raise exception 'Original Baltazar operation entry is missing'; end if;

  insert into public.operation_entries(
    period_id, daily_control_id, account_id, operated_on, phase,
    participant_role, destination, magnitude_cents, created_by
  )
  select target_period_id, target_control_id, links.account_id, '2026-10-29',
    'Evaluacion'::public.operation_phase,
    'replica'::public.daily_control_participant_role,
    'NETO BROKER -'::public.broker_result_destination,
    abs(per_account_cents), baltazar_id
  from public.ninja_operation_probe_sessions sessions
  join public.ninja_account_links links
    on links.connector_id = sessions.connector_id
    and links.connection_name = sessions.connection_name
    and links.external_account_name = sessions.account_name
    and links.closed_at is null
  where sessions.id in (2626279, 2626244, 2626318, 2626283);

  if (select count(*) from public.ninja_operation_batch_members members
      where members.batch_id = target_batch_id and members.role = 'prop') <> 5
    or (select count(*) from public.daily_control_participants participants
        where participants.daily_control_id = target_control_id) <> 5
    or (select count(*) from public.operation_entries entries
        where entries.daily_control_id = target_control_id) <> 5 then
    raise exception 'Baltazar repair did not produce five economic participants';
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id,
    'ninja_operation_batches',
    target_batch_id,
    'partial_replica_batch_repaired',
    jsonb_build_object(
      'daily_control_id', target_control_id,
      'broker_result_cents', -53574,
      'prop_accounts', 5,
      'allocated_per_account_cents', per_account_cents,
      'rounding_difference_cents', -1,
      'session_ids', jsonb_build_array(2626279, 2626244, 2626211, 2626318, 2626283)
    ),
    'Reparación solicitada: el trade simultáneo de Baltazar fue confirmado antes de recibir las cinco réplicas'
  );
end;
$repair$;

commit;
