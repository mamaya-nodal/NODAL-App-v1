-- Reparacion puntual del incidente de Alfred del 29/30-09-2026.
-- Ejecutar primero dentro de BEGIN/ROLLBACK y luego dentro de BEGIN/COMMIT.
-- Conserva los controles 19, 20 y 21; no modifica sus importes.

set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $repair$
declare
  owner_id uuid;
  pair_record record;
  account_record record;
  old_connector public.ninja_connectors%rowtype;
  new_connector public.ninja_connectors%rowtype;
  duplicate_snapshot jsonb;
  connector_snapshot jsonb;
  restored_links integer;
begin
  select id into strict owner_id
  from public.nodal_users
  where lower(email) = 'sbdigitalmarkets@gmail.com'
  for update;

  if exists (
    select 1 from public.audit_events
    where actor_user_id = owner_id
      and action = 'alfred_connector_continuity_restored'
  ) then
    return;
  end if;

  for pair_record in
    select * from (values
      ('b196221e-c5ba-4f64-a059-c9b47d0c1826'::uuid, '6025a923-f094-4b39-94fb-7273110724ed'::uuid, 'principal'),
      ('10eab8e4-aabd-4957-8d5e-5c421f848310'::uuid, 'd6efb2ee-eca5-48a3-834b-c95f2195c3e6'::uuid, 'lupe'),
      ('06736fbc-fddb-4ea8-8b2f-c25fb3b2475c'::uuid, '60dd761c-6761-450b-b57b-b14fa32c062e'::uuid, 'horacio'),
      ('0e03144a-72c0-46bc-9afd-0956ca8ddac1'::uuid, '1a6e0fe1-a279-436d-9346-0b7d52b703b0'::uuid, 'nati'),
      ('585f4180-16c3-47d1-ad70-7a6aa36d03df'::uuid, 'b4361890-52ca-421f-8a1d-2828fa2291ec'::uuid, 'roberto')
    ) pairs(old_id, new_id, scope_name)
  loop
    select * into strict old_connector
    from public.ninja_connectors where id = pair_record.old_id for update;
    select * into strict new_connector
    from public.ninja_connectors where id = pair_record.new_id for update;

    if old_connector.owner_user_id <> owner_id
      or new_connector.owner_user_id <> owner_id
      or old_connector.identity_id is distinct from new_connector.identity_id
      or old_connector.status <> 'revoked'
      or new_connector.status <> 'active'
    then
      raise exception 'Connector scope/status changed for %', pair_record.scope_name;
    end if;

    if exists (
      select 1
      from public.ninja_operation_probe_sessions old_session
      join public.ninja_operation_probe_sessions new_session
        on new_session.connector_id = pair_record.new_id
       and new_session.opening_event_id = old_session.opening_event_id
      where old_session.connector_id = pair_record.old_id
    ) then
      raise exception 'Overlapping operation session ids for %', pair_record.scope_name;
    end if;
  end loop;

  select jsonb_agg(jsonb_build_object(
    'connector_id', connectors.id,
    'status', connectors.status,
    'identity_id', connectors.identity_id,
    'links', (select count(*) from public.ninja_account_links links where links.connector_id = connectors.id),
    'sessions', (select count(*) from public.ninja_operation_probe_sessions sessions where sessions.connector_id = connectors.id),
    'batches', (select count(*) from public.ninja_operation_batches batches where batches.connector_id = connectors.id),
    'exclusions', (select count(*) from public.ninja_account_registration_exclusions exclusions where exclusions.connector_id = connectors.id)
  ) order by connectors.paired_at)
  into connector_snapshot
  from public.ninja_connectors connectors
  where connectors.owner_user_id = owner_id;

  select jsonb_agg(jsonb_build_object(
    'external_account_name', mapping.external_account_name,
    'original_account', to_jsonb(original_account),
    'duplicate_account', to_jsonb(duplicate_account),
    'original_purchase', to_jsonb(original_purchase),
    'duplicate_purchase', to_jsonb(duplicate_purchase),
    'original_assignment', to_jsonb(original_assignment),
    'duplicate_assignment', to_jsonb(duplicate_assignment),
    'original_link', to_jsonb(original_link),
    'duplicate_link', to_jsonb(duplicate_link)
  ) order by mapping.external_account_name)
  into duplicate_snapshot
  from (values
    ('TDFYSL50227867328', '2247a2ff-b955-4f58-90fc-5c38fc9ba433'::uuid, '78214f7f-5b5a-48cb-9859-6e20511c3fb5'::uuid),
    ('TDFYSL50293633704', '6a98ebb6-5c06-47de-baac-e3d7e638b82c'::uuid, '52a07db3-e6c9-4209-aab0-e41d1131f4d4'::uuid),
    ('TDFYSL50529077748', '539e248d-adc7-4681-bc51-b4fc0c1dbaf4'::uuid, '9c78b984-44c7-421d-ba66-8bdf87246f7f'::uuid),
    ('TDFYSL50558089557', 'cf36a02b-bfd6-4da6-acc7-3ccdaa43aee2'::uuid, 'aaf7b32b-3e78-4307-9faa-53b4f50c1d70'::uuid),
    ('TDFYSL50560378377', 'c6883efc-2e9a-4a8f-a846-7fee6c0773ad'::uuid, 'e54c2bc7-a9f1-4a19-b7a9-7d7936db6f8e'::uuid)
  ) mapping(external_account_name, original_account_id, duplicate_account_id)
  join public.accounts original_account on original_account.id = mapping.original_account_id
  join public.accounts duplicate_account on duplicate_account.id = mapping.duplicate_account_id
  join public.purchases original_purchase on original_purchase.account_id = original_account.id
  join public.purchases duplicate_purchase on duplicate_purchase.account_id = duplicate_account.id
  join public.identity_account_assignments original_assignment
    on original_assignment.account_id = original_account.id and original_assignment.unassigned_at is null
  join public.identity_account_assignments duplicate_assignment
    on duplicate_assignment.account_id = duplicate_account.id and duplicate_assignment.unassigned_at is null
  join public.ninja_account_links original_link
    on original_link.account_id = original_account.id
   and original_link.external_account_name = mapping.external_account_name
  join public.ninja_account_links duplicate_link
    on duplicate_link.account_id = duplicate_account.id
   and duplicate_link.external_account_name = mapping.external_account_name;

  if jsonb_array_length(coalesce(duplicate_snapshot, '[]'::jsonb)) <> 5 then
    raise exception 'The five duplicated Nati accounts no longer match the inspected state';
  end if;

  -- Las cuentas originales no tenian actividad; las cinco copias contienen
  -- exactamente la operacion conciliada del control 20.
  if (select count(*) from public.operation_entries where account_id in (
      '78214f7f-5b5a-48cb-9859-6e20511c3fb5', '52a07db3-e6c9-4209-aab0-e41d1131f4d4',
      '9c78b984-44c7-421d-ba66-8bdf87246f7f', 'aaf7b32b-3e78-4307-9faa-53b4f50c1d70',
      'e54c2bc7-a9f1-4a19-b7a9-7d7936db6f8e'
    )) <> 5
    or (select count(*) from public.daily_control_participants where account_id in (
      '78214f7f-5b5a-48cb-9859-6e20511c3fb5', '52a07db3-e6c9-4209-aab0-e41d1131f4d4',
      '9c78b984-44c7-421d-ba66-8bdf87246f7f', 'aaf7b32b-3e78-4307-9faa-53b4f50c1d70',
      'e54c2bc7-a9f1-4a19-b7a9-7d7936db6f8e'
    )) <> 5
  then
    raise exception 'Unexpected economic references on the duplicated Nati accounts';
  end if;

  -- Restaura historial tecnico bajo los conectores activos. Nati se trata
  -- aparte porque ya habia vuelto a registrar las mismas cinco cuentas.
  for pair_record in
    select * from (values
      ('b196221e-c5ba-4f64-a059-c9b47d0c1826'::uuid, '6025a923-f094-4b39-94fb-7273110724ed'::uuid, 'principal'),
      ('10eab8e4-aabd-4957-8d5e-5c421f848310'::uuid, 'd6efb2ee-eca5-48a3-834b-c95f2195c3e6'::uuid, 'lupe'),
      ('06736fbc-fddb-4ea8-8b2f-c25fb3b2475c'::uuid, '60dd761c-6761-450b-b57b-b14fa32c062e'::uuid, 'horacio'),
      ('0e03144a-72c0-46bc-9afd-0956ca8ddac1'::uuid, '1a6e0fe1-a279-436d-9346-0b7d52b703b0'::uuid, 'nati'),
      ('585f4180-16c3-47d1-ad70-7a6aa36d03df'::uuid, 'b4361890-52ca-421f-8a1d-2828fa2291ec'::uuid, 'roberto')
    ) pairs(old_id, new_id, scope_name)
  loop
    if pair_record.scope_name <> 'nati' then
      update public.ninja_account_links
      set connector_id = pair_record.new_id
      where connector_id = pair_record.old_id;
    end if;

    update public.ninja_account_registration_exclusions
    set connector_id = pair_record.new_id
    where connector_id = pair_record.old_id;

    update public.ninja_operation_probe_sessions
    set connector_id = pair_record.new_id
    where connector_id = pair_record.old_id;

    update public.ninja_operation_batches
    set connector_id = pair_record.new_id
    where connector_id = pair_record.old_id;

    update public.ninja_inventory_snapshots
    set connector_id = pair_record.new_id
    where connector_id = pair_record.old_id;

    update public.ninja_trade_telemetry_events old_event
    set connector_id = pair_record.new_id
    where old_event.connector_id = pair_record.old_id
      and not exists (
        select 1 from public.ninja_trade_telemetry_events current_event
        where current_event.connector_id = pair_record.new_id
          and current_event.event_id = old_event.event_id
      );

    update public.ninja_account_change_events old_event
    set connector_id = pair_record.new_id
    where old_event.connector_id = pair_record.old_id
      and not exists (
        select 1 from public.ninja_account_change_events current_event
        where current_event.connector_id = pair_record.new_id
          and current_event.source_event_id = old_event.source_event_id
          and current_event.connection_name = old_event.connection_name
          and current_event.event_type = old_event.event_type
          and current_event.from_life_id is not distinct from old_event.from_life_id
          and current_event.to_life_id is not distinct from old_event.to_life_id
      );

    update public.ninja_broker_balance_events old_event
    set connector_id = pair_record.new_id
    where old_event.connector_id = pair_record.old_id
      and not exists (
        select 1 from public.ninja_broker_balance_events current_event
        where current_event.connector_id = pair_record.new_id
          and current_event.source_event_id = old_event.source_event_id
      );

    insert into public.ninja_operation_probe_allowlist(
      connector_id, connection_name, account_name, enabled, created_at
    )
    select pair_record.new_id, connection_name, account_name, enabled, created_at
    from public.ninja_operation_probe_allowlist
    where connector_id = pair_record.old_id
    on conflict(connector_id, connection_name, account_name) do update
      set enabled = excluded.enabled;

    delete from public.ninja_operation_probe_allowlist
    where connector_id = pair_record.old_id;

    insert into public.ninja_connector_connection_reviews(
      connector_id, connection_name, status, reviewed_by, reviewed_at
    )
    select pair_record.new_id, connection_name, status, reviewed_by, reviewed_at
    from public.ninja_connector_connection_reviews
    where connector_id = pair_record.old_id
    on conflict(connector_id, connection_name) do update
      set status = case
        when excluded.status = 'isolated' then 'isolated'
        else public.ninja_connector_connection_reviews.status
      end;
  end loop;

  -- Fusiona las cinco cuentas de Nati: mantiene compra, referencia e identidad
  -- originales y traslada solamente la operacion registrada el 29/09.
  for account_record in
    select * from (values
      ('TDFYSL50227867328', '2247a2ff-b955-4f58-90fc-5c38fc9ba433'::uuid, '78214f7f-5b5a-48cb-9859-6e20511c3fb5'::uuid),
      ('TDFYSL50293633704', '6a98ebb6-5c06-47de-baac-e3d7e638b82c'::uuid, '52a07db3-e6c9-4209-aab0-e41d1131f4d4'::uuid),
      ('TDFYSL50529077748', '539e248d-adc7-4681-bc51-b4fc0c1dbaf4'::uuid, '9c78b984-44c7-421d-ba66-8bdf87246f7f'::uuid),
      ('TDFYSL50558089557', 'cf36a02b-bfd6-4da6-acc7-3ccdaa43aee2'::uuid, 'aaf7b32b-3e78-4307-9faa-53b4f50c1d70'::uuid),
      ('TDFYSL50560378377', 'c6883efc-2e9a-4a8f-a846-7fee6c0773ad'::uuid, 'e54c2bc7-a9f1-4a19-b7a9-7d7936db6f8e'::uuid)
    ) mapping(external_account_name, original_account_id, duplicate_account_id)
  loop
    update public.ninja_account_links
    set closed_at = coalesce(closed_at, (
          select current_link.linked_at
          from public.ninja_account_links current_link
          where current_link.account_id = account_record.duplicate_account_id
        )),
        closure_reason = coalesce(closure_reason, 'connector_repair')
    where account_id = account_record.original_account_id
      and connector_id = '0e03144a-72c0-46bc-9afd-0956ca8ddac1';

    update public.ninja_account_links
    set account_id = account_record.original_account_id
    where account_id = account_record.duplicate_account_id
      and connector_id = '1a6e0fe1-a279-436d-9346-0b7d52b703b0';

    update public.daily_controls
    set leader_account_id = account_record.original_account_id
    where leader_account_id = account_record.duplicate_account_id;

    update public.daily_control_participants
    set account_id = account_record.original_account_id
    where account_id = account_record.duplicate_account_id;

    update public.operation_entries
    set account_id = account_record.original_account_id
    where account_id = account_record.duplicate_account_id;

    update public.ninja_operation_batch_members
    set account_id = account_record.original_account_id
    where account_id = account_record.duplicate_account_id;

    update public.ninja_operation_batch_manual_accounts
    set account_id = account_record.original_account_id
    where account_id = account_record.duplicate_account_id;

    delete from public.identity_account_assignments
    where account_id = account_record.duplicate_account_id;

    delete from public.purchases
    where account_id = account_record.duplicate_account_id;

    delete from public.accounts
    where id = account_record.duplicate_account_id;

    perform public.recalculate_nodal_account_state(account_record.original_account_id);
  end loop;

  -- La subcuenta 1584435 ya fue conciliada con Lupe. Esta segunda observacion
  -- es la misma cobertura vista desde el Ninja de Nati y no tiene asiento.
  if exists (
    select 1 from public.ninja_operation_batches
    where id = '45a07d04-1dcf-4c42-b1b8-6926d001f7f8'
      and daily_control_id is not null
  ) then
    raise exception 'The duplicate broker observation acquired an economic control';
  end if;

  update public.ninja_operation_probe_sessions
  set excluded_at = now(), excluded_by = owner_id,
      exclusion_reason = 'Observacion duplicada de la cobertura 1584435 conciliada con Lupe'
  where id = 120852 and excluded_at is null;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
  ) values (
    owner_id, 'ninja_connectors', '6025a923-f094-4b39-94fb-7273110724ed',
    'alfred_connector_continuity_restored',
    jsonb_build_object(
      'connectors_before', connector_snapshot,
      'duplicated_nati_accounts', duplicate_snapshot,
      'duplicate_broker_batch', '45a07d04-1dcf-4c42-b1b8-6926d001f7f8'
    ),
    jsonb_build_object(
      'controls_preserved', jsonb_build_array(19, 20, 21),
      'control_results_cents', jsonb_build_array(-54574, -54574, -17504),
      'nati_accounts_merged', 5,
      'duplicate_broker_session_excluded', 120852,
      'economic_amounts_changed', false
    ),
    'Reparacion autorizada de fragmentacion por revinculacion y duplicados derivados. Se preservan compras originales, operaciones y controles reales.'
  );

  select count(*) into restored_links
  from public.ninja_account_links links
  join public.ninja_connectors connectors on connectors.id = links.connector_id
  where connectors.owner_user_id = owner_id and connectors.status = 'active';

  if restored_links <> 25 then
    raise exception 'Unexpected final active link count: %', restored_links;
  end if;

  if (select count(*) from public.accounts accounts
      join public.periods periods on periods.id = accounts.period_id
      join public.workspaces spaces on spaces.id = periods.workspace_id
      where spaces.owner_user_id = owner_id) <> 25 then
    raise exception 'Unexpected final account count';
  end if;
end;
$repair$;

select jsonb_build_object(
  'repair_audit', (select count(*) from public.audit_events
    where action = 'alfred_connector_continuity_restored'),
  'controls', (select jsonb_agg(jsonb_build_object(
      'number', control_number,
      'result_cents', operating_result_cents,
      'source_event_key', source_event_key
    ) order by control_number)
    from public.daily_controls
    where id in (
      '9820ad19-8ad6-45f4-a7f9-fffcbd74b094',
      '3c2a009a-773e-4775-917a-6f34022a6d08',
      '08ad4056-ca0e-45c3-8484-eb888f11c296'
    )),
  'false_pending_visible', exists(
    select 1 from public.ninja_operation_batches batches
    join public.ninja_operation_probe_sessions sessions on sessions.id = batches.broker_session_id
    where batches.id = '45a07d04-1dcf-4c42-b1b8-6926d001f7f8'
      and sessions.excluded_at is null
  ),
  'duplicate_accounts_remaining', (select count(*) from public.accounts
    where id in (
      '78214f7f-5b5a-48cb-9859-6e20511c3fb5', '52a07db3-e6c9-4209-aab0-e41d1131f4d4',
      '9c78b984-44c7-421d-ba66-8bdf87246f7f', 'aaf7b32b-3e78-4307-9faa-53b4f50c1d70',
      'e54c2bc7-a9f1-4a19-b7a9-7d7936db6f8e'
    ))
) as verification;
