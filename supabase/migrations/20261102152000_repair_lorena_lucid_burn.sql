-- Registra como históricas y cerradas las cinco cuentas Lucid de evaluación
-- que Lore operó desde su Identidad el 30/10. El conector conservó inventario
-- y evidencia de quema, pero no transmitió ejecuciones ni creó un lote. El
-- saldo broker posterior confirmado pasa de 6.372,60 a 7.391,40.

begin;

do $repair$
declare
  lore_id constant uuid := '2b0f63da-bf32-41ee-86c2-98fb5dbe583b';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_workspace_id constant uuid := '3c550aea-3305-4fd7-8d29-c2f4e29b0445';
  identity_id constant uuid := '758172e2-3125-48c8-b574-7426e403e8bb';
  target_period_id constant uuid := '6325a8a9-1ac4-469b-84fa-08e040faf81b';
  target_connector_id constant uuid := 'a697d39d-a2c6-439f-aa8a-fc9075da40e5';
  lucid_company_id constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  first_seen_at constant timestamptz := '2026-10-29T14:07:43.493606+00:00';
  burned_at constant timestamptz := '2026-10-30T15:00:17.961148+00:00';
  account_ids constant uuid[] := array[
    '540936b1-a5e8-4a91-a23a-33a2bc925b74'::uuid,
    '84648bdc-3097-400f-bc4c-d02191565422'::uuid,
    '08b88442-9e42-47ec-bb01-8423132ebcc5'::uuid,
    'cbed0ab5-b992-4ceb-a844-ee4f52189a89'::uuid,
    'a45f895a-3b7f-4ed1-9ba7-35161be376c1'::uuid
  ];
  external_names constant text[] := array[
    'LFE05090639190050',
    'LFE05090639190051',
    'LFE05090639190052',
    'LFE05090639190053',
    'LFE05090639190054'
  ];
  life_ids constant text[] := array[
    'b821640b-b0b1-448b-aef4-b58c62717484',
    'd5d8db9c-41a1-4791-aef5-006a448fd275',
    '08e27571-0b85-4c65-9776-316d8d87c9b6',
    'f5dbd245-042d-432e-a4f6-5ce2cba99296',
    'c4b741fd-9728-49a9-80ca-7a3afe2b85d5'
  ];
  target_control_id uuid;
  idx integer;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'periods'
      and events.entity_id = target_period_id
      and events.action = 'lorena_lucid_burn_recovered'
  ) then return; end if;

  if not exists (
    select 1 from public.companies companies
    where companies.id = lucid_company_id and companies.code = 'LUCID'
  ) then raise exception 'Lucid company changed; aborting controlled recovery'; end if;

  if not exists (
    select 1 from public.nodal_identities identities
    where identities.id = identity_id and identities.workspace_id = target_workspace_id
  ) then raise exception 'Lorena identity changed; aborting controlled recovery'; end if;

  if not exists (
    select 1 from public.daily_controls controls
    where controls.period_id = target_period_id
      and controls.control_number = 10
      and controls.operated_on = date '2026-10-30'
      and controls.balance_after_cents = 637260
  ) or (select count(*) from public.daily_controls where period_id = target_period_id) <> 10 then
    raise exception 'Lorena recovered broker chain changed; aborting Lucid recovery';
  end if;

  if not exists (
    select 1 from public.ninja_trade_telemetry_events events
    where events.connector_id = 'cfefc40f-e916-4469-aae8-47a508ac7a42'::uuid
      and events.event_type = 'balance'
      and events.account_name = '2199664'
      and events.occurred_at >= '2026-11-02T13:04:57+00:00'
      and round(((events.payload ->> 'cashValue')::numeric) * 100)::bigint = 739140
  ) then raise exception 'Current Lorena broker balance evidence is missing'; end if;

  if (
    select count(*) from public.ninja_account_change_events events
    where events.connector_id = target_connector_id
      and events.connection_name = 'LucidDavid'
      and events.event_type = 'new_account'
      and events.occurred_at = first_seen_at
      and events.to_account_name = any(external_names)
      and events.resolution_status = 'pending'
  ) <> 5 then raise exception 'Expected five pending Lorena Lucid accounts'; end if;

  if (
    select count(*) from public.ninja_account_change_events events
    where events.connector_id = target_connector_id
      and events.connection_name = 'LucidDavid'
      and events.event_type = 'burned'
      and events.occurred_at = burned_at
      and events.from_account_name = any(external_names)
      and events.resolution_status = 'automatic'
  ) <> 5 then raise exception 'Expected five automatic Lorena Lucid burns'; end if;

  if exists (
    select 1 from public.ninja_account_links links
    where links.connector_id = target_connector_id
      and links.external_account_name = any(external_names)
  ) then raise exception 'A Lorena Lucid account was already registered'; end if;

  if (select coalesce(max(accounts.reference_number), 0)
      from public.accounts accounts where accounts.period_id = target_period_id) <> 5
    or (select coalesce(max(purchases.purchase_number), 0)
        from public.purchases purchases where purchases.period_id = target_period_id) <> 5
  then raise exception 'Lorena account numbering changed; aborting controlled recovery'; end if;

  for idx in 1..5 loop
    insert into public.accounts(
      id, period_id, company_id, reference_number, state, state_origin,
      created_by, created_at, updated_by, updated_at
    ) values (
      account_ids[idx], target_period_id, lucid_company_id, 5 + idx,
      'closed', 'automatic', lore_id, first_seen_at, admin_id, now()
    );

    -- El costo de compra no sobrevivió al reinicio y no se inventa una salida
    -- de fondos. Se conserva una compra en cero para que la cuenta sea verificable.
    insert into public.purchases(
      period_id, account_id, purchase_number, purchased_on, price_cents,
      funds_origin, created_by, created_at, updated_by, updated_at
    ) values (
      target_period_id, account_ids[idx], 5 + idx, date '2026-10-29', 0,
      'Aporte trader', lore_id, first_seen_at, admin_id, now()
    );

    insert into public.ninja_account_links(
      account_id, connector_id, connection_name, external_account_name,
      first_seen_at, linked_by, linked_at, closed_at, phase, life_id,
      closure_reason, accounting_phase, completed_trade_days
    ) values (
      account_ids[idx], target_connector_id, 'LucidDavid', external_names[idx],
      first_seen_at, lore_id, first_seen_at, burned_at, 'Evaluation', life_ids[idx],
      'burned', 'Evaluacion', 1
    );

    insert into public.identity_account_assignments(
      workspace_id, identity_id, account_id, assigned_at, unassigned_at,
      created_by, ended_by, correction_reason
    ) values (
      target_workspace_id, identity_id, account_ids[idx], first_seen_at, burned_at,
      lore_id, admin_id, 'Cuenta histórica cerrada por quema el 30/10'
    );
  end loop;

  insert into public.daily_controls(
    period_id, control_number, operated_on, kind,
    balance_before_cents, balance_after_cents, operating_result_cents,
    company_id, leader_account_id, phase, observations, source,
    confirmation_key, created_by, updated_by
  ) values (
    target_period_id, 11, date '2026-10-30', 'balance_update',
    637260, 739140, 101880,
    lucid_company_id, account_ids[1], 'Evaluacion',
    'Recuperación auditada de la cobertura de cinco cuentas Lucid quemadas desde una Identidad.',
    'manual', '10e10000-0000-4000-8000-000000000001', lore_id, admin_id
  ) returning id into target_control_id;

  insert into public.daily_control_participants(
    daily_control_id, period_id, account_id, role, allocated_result_cents
  )
  select target_control_id, target_period_id, participant.account_id,
    case when participant.ordinality = 1
      then 'leader'::public.daily_control_participant_role
      else 'replica'::public.daily_control_participant_role end,
    20376
  from unnest(account_ids) with ordinality participant(account_id, ordinality);

  insert into public.operation_entries(
    period_id, daily_control_id, account_id, operated_on, phase,
    participant_role, destination, magnitude_cents,
    created_by, created_at, updated_by, updated_at
  )
  select target_period_id, target_control_id, participant.account_id,
    date '2026-10-30', 'Evaluacion',
    case when participant.ordinality = 1
      then 'leader'::public.daily_control_participant_role
      else 'replica'::public.daily_control_participant_role end,
    'NETO BROKER +'::public.broker_result_destination, 20376,
    lore_id, burned_at, admin_id, now()
  from unnest(account_ids) with ordinality participant(account_id, ordinality);

  update public.ninja_account_change_events events
  set resolution_status = 'confirmed'
  where events.connector_id = target_connector_id
    and events.connection_name = 'LucidDavid'
    and events.event_type = 'new_account'
    and events.occurred_at = first_seen_at
    and events.to_account_name = any(external_names)
    and events.resolution_status = 'pending';
  if not found then raise exception 'Lorena Lucid pending events were not resolved'; end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  )
  select admin_id, 'accounts', account.id, 'historical_burned_account_recovered',
    jsonb_build_object(
      'external_account_name', external_names[account.ordinality],
      'identity_id', identity_id,
      'company_id', lucid_company_id,
      'phase', 'Evaluacion',
      'baseline_completed_trade_days', 1,
      'closing_trade_result_cents', 20376,
      'closed_at', burned_at,
      'purchase_price_cents', 0,
      'purchase_price_limitation', 'No recuperable luego del reinicio; no se inventó una salida de fondos'
    ),
    'Cuenta y quema recuperadas desde inventario Ninja; resultado broker confirmado por Mauricio'
  from unnest(account_ids) with ordinality account(id, ordinality);

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id, 'daily_controls', target_control_id, 'daily_control_recovered',
    jsonb_build_object(
      'period_id', target_period_id,
      'control_number', 11,
      'operated_on', '2026-10-30',
      'balance_before_cents', 637260,
      'balance_after_cents', 739140,
      'operating_result_cents', 101880,
      'participant_count', 5,
      'allocated_per_account_cents', 20376,
      'source', 'manual'
    ),
    'Operación reconstruida desde quemas inventariadas y saldo broker confirmado; sin inventar telemetría Ninja'
  );

  if (select count(*) from public.accounts accounts
      where accounts.id = any(account_ids) and accounts.state = 'closed') <> 5
    or (select count(*) from public.purchases purchases
        where purchases.account_id = any(account_ids) and purchases.price_cents = 0) <> 5
    or (select count(*) from public.ninja_account_links links
        where links.account_id = any(account_ids)
          and links.closed_at = burned_at and links.closure_reason = 'burned') <> 5
    or (select count(*) from public.daily_control_participants participants
        where participants.daily_control_id = target_control_id
          and participants.allocated_result_cents = 20376) <> 5
    or (select count(*) from public.operation_entries entries
        where entries.daily_control_id = target_control_id
          and entries.destination = 'NETO BROKER +'
          and entries.magnitude_cents = 20376) <> 5
    or (select sum(participants.allocated_result_cents)
        from public.daily_control_participants participants
        where participants.daily_control_id = target_control_id) <> 101880
    or not exists (
      select 1 from public.daily_controls controls
      where controls.id = target_control_id
        and controls.balance_before_cents = 637260
        and controls.balance_after_cents = 739140
        and controls.operating_result_cents = 101880
    )
  then raise exception 'Lorena Lucid burn recovery integrity check failed'; end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id, 'periods', target_period_id, 'lorena_lucid_burn_recovered',
    jsonb_build_object(
      'identity_id', identity_id,
      'connector_id', target_connector_id,
      'company', 'LUCID',
      'closed_accounts', 5,
      'burned_at', burned_at,
      'broker_result_cents', 101880,
      'allocated_per_account_cents', 20376,
      'final_broker_balance_cents', 739140,
      'purchase_price_cents', 0,
      'telemetry_recreated', false
    ),
    'Corrección solicitada por Mauricio para cerrar las cinco Lucid omitidas y conservar el nuevo saldo broker'
  );
end;
$repair$;

commit;
