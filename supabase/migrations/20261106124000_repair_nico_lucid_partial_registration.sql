-- Nico: el conector recibió las cinco ejecuciones LUCID simultáneas, pero las
-- cuentas se registraron después. El proceso técnico sólo había reconstruido
-- la primera sesión vinculada y confirmó todo el resultado allí.
-- Esta reparación conserva el único control broker y redistribuye su resultado
-- entre las cinco cuentas respaldadas por telemetría original.

begin;

do $repair$
declare
  nico_id constant uuid := '07e71363-9aeb-424b-aa91-0b20c16361f6';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_connector_id constant uuid := '50553cf1-b40c-4277-9896-0080fea578c9';
  target_batch_id constant uuid := '0648e2b1-4012-4c8e-b419-732da7dea7fb';
  target_control_id constant uuid := '3c78a786-4c90-4d0f-bc19-1aaa9deadf64';
  target_period_id constant uuid := 'a6693d43-ffba-471e-9321-dddddd0f73c0';
  target_company_id constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  per_account_cents constant bigint := -7918;
  names constant text[] := array[
    'LFE05086357300109', 'LFE05086357300110', 'LFE05086357300111',
    'LFE05086357300112', 'LFE05086357300113'
  ];
  inserted_count integer;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'ninja_operation_batches'
      and events.entity_id = target_batch_id
      and events.action = 'nico_partial_registration_repaired'
  ) then
    return;
  end if;

  if not exists (
    select 1 from public.ninja_operation_batches batches
    where batches.id = target_batch_id
      and batches.connector_id = target_connector_id
      and batches.accounting_status = 'committed'
      and batches.daily_control_id = target_control_id
      and batches.broker_result_cents = -39590
      and batches.context_prop_count = 1
  ) then
    raise exception 'Nico committed batch changed; aborting controlled repair';
  end if;

  if not exists (
    select 1 from public.daily_controls controls
    where controls.id = target_control_id
      and controls.period_id = target_period_id
      and controls.control_number = 2
      and controls.phase = 'Evaluacion'
      and controls.balance_before_cents = 1283652
      and controls.balance_after_cents = 1244062
      and controls.operating_result_cents = -39590
  ) then
    raise exception 'Nico daily control continuity changed; aborting controlled repair';
  end if;

  if (
    select count(distinct events.account_name)
    from public.ninja_trade_telemetry_events events
    where events.connector_id = target_connector_id
      and events.connection_name = 'LUCID'
      and events.account_name = any(names)
      and events.event_type = 'execution'
      and events.occurred_at >= timestamptz '2026-11-06 14:52:00+00'
      and events.occurred_at < timestamptz '2026-11-06 14:55:00+00'
  ) <> 5 then
    raise exception 'Expected five original Nico LUCID execution streams';
  end if;

  -- Recupera las cuatro sesiones técnicas ausentes únicamente desde la
  -- telemetría recibida. No se crea ni se inventa una operación económica.
  insert into public.ninja_operation_probe_sessions(
    connector_id, connection_name, account_name, opening_event_id, opened_at,
    flat_at, last_event_at, settled_at, status, execution_count, instruments,
    direction, quantity
  )
  select
    target_connector_id,
    'LUCID',
    events.account_name,
    min(events.id) filter (where events.event_type = 'execution') as opening_event_id,
    min(events.occurred_at) filter (where events.event_type = 'execution') as opened_at,
    min(events.occurred_at) filter (
      where events.event_type = 'position'
        and coalesce(events.payload->>'marketPosition', '') = 'Flat'
    ) as flat_at,
    max(events.occurred_at) as last_event_at,
    max(events.occurred_at) as settled_at,
    'closed',
    count(*) filter (where events.event_type = 'execution')::integer,
    array['NQ DEC26']::text[],
    case min(events.payload->>'orderAction') filter (where events.event_type = 'execution')
      when 'Buy' then 'Long' else 'Short' end,
    max(coalesce((events.payload->>'quantity')::integer, 0)) filter (where events.event_type = 'execution')
  from public.ninja_trade_telemetry_events events
  where events.connector_id = target_connector_id
    and events.connection_name = 'LUCID'
    and events.account_name = any(names)
    and events.occurred_at >= timestamptz '2026-11-06 14:52:00+00'
    and events.occurred_at < timestamptz '2026-11-06 14:55:00+00'
  group by events.account_name
  on conflict (connector_id, opening_event_id) do nothing;

  if (
    select count(*)
    from public.ninja_operation_probe_sessions sessions
    where sessions.connector_id = target_connector_id
      and sessions.connection_name = 'LUCID'
      and sessions.account_name = any(names)
      and sessions.opened_at >= timestamptz '2026-11-06 14:52:00+00'
      and sessions.opened_at < timestamptz '2026-11-06 14:55:00+00'
      and sessions.status = 'closed'
  ) <> 5 then
    raise exception 'Expected five reconstructed Nico technical sessions';
  end if;

  if (
    select count(*)
    from public.accounts accounts
    join public.ninja_account_links links
      on links.account_id = accounts.id and links.closed_at is null
    where accounts.id = any(array[
      '4026bdba-4953-4f4b-b7d8-06acf9dc4fdf'::uuid,
      '05beb969-139e-4e72-bca4-f1e343b86a7e'::uuid,
      '8a4f16ec-a028-40a8-b071-cb42ee527741'::uuid,
      '0ef3c7bb-428e-4c68-86d9-0ced6056cc31'::uuid,
      '15f0ac96-803a-40c9-ab46-36ce0e667102'::uuid
    ])
      and accounts.period_id = target_period_id
      and accounts.company_id = target_company_id
      and links.connector_id = target_connector_id
      and links.connection_name = 'LUCID'
      and links.external_account_name = any(names)
  ) <> 5 then
    raise exception 'Expected five linked Nico LUCID accounts';
  end if;

  update public.ninja_operation_batches
  set distributed_cents = per_account_cents * 5,
      rounding_difference_cents = (per_account_cents * 5) - broker_result_cents,
      context_prop_count = 5,
      updated_at = now()
  where id = target_batch_id;

  update public.ninja_operation_batch_members
  set allocated_broker_result_cents = per_account_cents
  where batch_id = target_batch_id
    and account_id = '4026bdba-4953-4f4b-b7d8-06acf9dc4fdf'::uuid
    and role = 'prop';
  if not found then raise exception 'Original Nico prop member is missing'; end if;

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
  where sessions.connector_id = target_connector_id
    and sessions.connection_name = 'LUCID'
    and sessions.account_name = any(names)
    and links.account_id <> '4026bdba-4953-4f4b-b7d8-06acf9dc4fdf'::uuid;
  get diagnostics inserted_count = row_count;
  if inserted_count <> 4 then
    raise exception 'Expected four missing Nico batch members, inserted %', inserted_count;
  end if;

  update public.daily_control_participants
  set allocated_result_cents = per_account_cents
  where daily_control_id = target_control_id
    and account_id = '4026bdba-4953-4f4b-b7d8-06acf9dc4fdf'::uuid;
  if not found then raise exception 'Original Nico control participant is missing'; end if;

  insert into public.daily_control_participants(
    daily_control_id, period_id, account_id, role, allocated_result_cents
  )
  select target_control_id, target_period_id, links.account_id,
    'replica'::public.daily_control_participant_role, per_account_cents
  from public.ninja_account_links links
  where links.connector_id = target_connector_id
    and links.connection_name = 'LUCID'
    and links.external_account_name = any(names)
    and links.closed_at is null
    and links.account_id <> '4026bdba-4953-4f4b-b7d8-06acf9dc4fdf'::uuid;

  update public.operation_entries
  set magnitude_cents = abs(per_account_cents)
  where daily_control_id = target_control_id
    and account_id = '4026bdba-4953-4f4b-b7d8-06acf9dc4fdf'::uuid
    and destination = 'NETO BROKER -';
  if not found then raise exception 'Original Nico operation entry is missing'; end if;

  insert into public.operation_entries(
    period_id, daily_control_id, account_id, operated_on, phase,
    participant_role, destination, magnitude_cents, created_by
  )
  select target_period_id, target_control_id, links.account_id, '2026-11-06',
    'Evaluacion'::public.operation_phase,
    'replica'::public.daily_control_participant_role,
    'NETO BROKER -'::public.broker_result_destination,
    abs(per_account_cents), nico_id
  from public.ninja_account_links links
  where links.connector_id = target_connector_id
    and links.connection_name = 'LUCID'
    and links.external_account_name = any(names)
    and links.closed_at is null
    and links.account_id <> '4026bdba-4953-4f4b-b7d8-06acf9dc4fdf'::uuid;

  if (select count(*) from public.ninja_operation_batch_members members
      where members.batch_id = target_batch_id and members.role = 'prop') <> 5
    or (select count(*) from public.daily_control_participants participants
        where participants.daily_control_id = target_control_id) <> 5
    or (select count(*) from public.operation_entries entries
        where entries.daily_control_id = target_control_id) <> 5 then
    raise exception 'Nico repair did not produce five economic participants';
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id,
    'ninja_operation_batches',
    target_batch_id,
    'nico_partial_registration_repaired',
    jsonb_build_object(
      'daily_control_id', target_control_id,
      'broker_result_cents', -39590,
      'prop_accounts', 5,
      'allocated_per_account_cents', per_account_cents,
      'source_accounts', to_jsonb(names)
    ),
    'Reparación solicitada: las cinco ejecuciones LUCID fueron recibidas antes de registrar las cuentas'
  );
end;
$repair$;

commit;
