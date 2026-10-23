-- Inicio simplificado: reemplaza los registros de cuenta anteriores cuando no
-- tienen actividad económica. La identidad y los conectores se conservan.

create or replace function public.confirm_nodal_simplified_opening(
  target_period_id uuid,
  target_cutover_date date,
  target_broker_balance_cents bigint,
  target_floating_cents bigint,
  target_accounts jsonb default '[]'::jsonb,
  target_wallets jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_workspace_id uuid;
  snapshot_id uuid;
  account_value jsonb;
  archived_account record;
  selected_company_id uuid;
  selected_connector_id uuid;
  selected_connection_name text;
  selected_account_name text;
  selected_first_seen_at timestamptz;
  selected_phase text;
  next_purchase_number integer;
  next_reference_number integer;
  new_account_id uuid;
  new_purchase_id uuid;
begin
  if actor_id is null then raise exception 'OPENING_REVISION_NOT_AVAILABLE'; end if;
  if target_accounts is null or jsonb_typeof(target_accounts) <> 'array'
    or target_wallets is null or jsonb_typeof(target_wallets) <> 'array'
    or target_broker_balance_cents is null or target_broker_balance_cents < 0
    or target_floating_cents is null or target_floating_cents < 0 then
    raise exception 'SIMPLIFIED_OPENING_ACCOUNT_INVALID';
  end if;

  select periods.workspace_id
  into selected_workspace_id
  from public.periods periods
  join public.workspaces spaces on spaces.id = periods.workspace_id
  join public.nodal_users users on users.id = spaces.owner_user_id
  where periods.id = target_period_id
    and spaces.owner_user_id = actor_id
    and spaces.modality = 'real'
    and periods.lifecycle_status = 'open'
    and users.access_state = 'active'
  for update of periods;

  if selected_workspace_id is null then raise exception 'OPENING_REVISION_NOT_AVAILABLE'; end if;

  if exists (
    select 1
    from jsonb_array_elements(target_accounts) item
    group by item ->> 'connectorId', item ->> 'connectionName', item ->> 'accountName'
    having count(*) > 1
  ) then raise exception 'SIMPLIFIED_OPENING_ACCOUNT_INVALID'; end if;

  for account_value in select value from jsonb_array_elements(target_accounts)
  loop
    begin
      selected_company_id := (account_value ->> 'companyId')::uuid;
      selected_connector_id := (account_value ->> 'connectorId')::uuid;
      selected_first_seen_at := (account_value ->> 'firstSeenAt')::timestamptz;
    exception when others then
      raise exception 'SIMPLIFIED_OPENING_ACCOUNT_INVALID';
    end;
    selected_connection_name := nullif(btrim(account_value ->> 'connectionName'), '');
    selected_account_name := nullif(btrim(account_value ->> 'accountName'), '');
    selected_phase := account_value ->> 'phase';

    if selected_connection_name is null or selected_account_name is null
      or selected_phase not in ('Evaluation', 'Funded', 'Live')
      or not exists (
        select 1 from public.companies companies
        where companies.id = selected_company_id and companies.is_active
      )
      or not exists (
        select 1 from public.ninja_connectors connectors
        where connectors.id = selected_connector_id
          and connectors.owner_user_id = actor_id
          and connectors.status = 'active'
      ) then
      raise exception 'SIMPLIFIED_OPENING_ACCOUNT_INVALID';
    end if;

    if not exists (
      select 1
      from public.ninja_inventory_snapshots snapshots,
        jsonb_array_elements(snapshots.accounts) observed
      where snapshots.connector_id = selected_connector_id
        and observed ->> 'connectionName' = selected_connection_name
        and observed ->> 'accountName' = selected_account_name
    ) then raise exception 'SIMPLIFIED_OPENING_ACCOUNT_NOT_OBSERVED'; end if;

    if exists (
      select 1 from public.ninja_account_links links
      where links.connector_id = selected_connector_id
        and links.connection_name = selected_connection_name
        and links.external_account_name = selected_account_name
        and links.closed_at is null
        and not exists (
          select 1 from public.accounts existing_account
          where existing_account.id = links.account_id
            and existing_account.period_id = target_period_id
        )
    ) then raise exception 'SIMPLIFIED_OPENING_ACCOUNT_INVALID'; end if;
  end loop;

  -- El borrón sólo puede eliminar registros administrativos sin historia.
  -- Ante cualquier actividad, la transacción completa se cancela.
  if exists (
    select 1
    from public.accounts accounts
    where accounts.period_id = target_period_id
      and (
        exists (select 1 from public.daily_controls controls where controls.leader_account_id = accounts.id)
        or exists (select 1 from public.daily_control_participants participants where participants.account_id = accounts.id)
        or exists (select 1 from public.operation_entries entries where entries.account_id = accounts.id)
        or exists (select 1 from public.account_phase_withdrawals withdrawals where withdrawals.account_id = accounts.id)
        or exists (select 1 from public.funding_withdrawals withdrawals where withdrawals.account_id = accounts.id)
        or exists (select 1 from public.manual_account_balance_observations observations where observations.account_id = accounts.id)
        or exists (select 1 from public.ninja_operation_batch_members members where members.account_id = accounts.id)
        or exists (select 1 from public.ninja_operation_batch_manual_accounts manual_accounts where manual_accounts.account_id = accounts.id)
        or exists (select 1 from public.account_period_carryovers carryovers where carryovers.account_id = accounts.id)
      )
  ) then raise exception 'SIMPLIFIED_OPENING_EXISTING_ACCOUNT_HAS_ACTIVITY'; end if;

  for archived_account in
    select
      accounts.id,
      jsonb_build_object(
        'account', to_jsonb(accounts),
        'purchase', (
          select to_jsonb(purchases)
          from public.purchases purchases
          where purchases.account_id = accounts.id
        ),
        'ninja_links', coalesce((
          select jsonb_agg(to_jsonb(links) order by links.first_seen_at)
          from public.ninja_account_links links
          where links.account_id = accounts.id
        ), '[]'::jsonb),
        'identity_assignments', coalesce((
          select jsonb_agg(to_jsonb(assignments) order by assignments.assigned_at)
          from public.identity_account_assignments assignments
          where assignments.account_id = accounts.id
        ), '[]'::jsonb)
      ) as previous_data
    from public.accounts accounts
    where accounts.period_id = target_period_id
    order by accounts.created_at, accounts.id
  loop
    insert into public.audit_events(
      actor_user_id, entity_table, entity_id, action, previous_data, reason
    ) values (
      actor_id, 'accounts', archived_account.id,
      'simplified_opening_account_archived', archived_account.previous_data,
      'Registro anterior sin actividad archivado por nuevo inicio simplificado'
    );
  end loop;

  delete from public.identity_account_assignments assignments
  where assignments.account_id in (
    select accounts.id from public.accounts accounts where accounts.period_id = target_period_id
  );
  delete from public.ninja_account_links links
  where links.account_id in (
    select accounts.id from public.accounts accounts where accounts.period_id = target_period_id
  );
  delete from public.purchases purchases
  where purchases.account_id in (
    select accounts.id from public.accounts accounts where accounts.period_id = target_period_id
  );
  delete from public.accounts accounts where accounts.period_id = target_period_id;

  snapshot_id := public.revise_nodal_period_opening(
    target_period_id => target_period_id,
    target_start_mode => 'zero',
    target_cutover_date => target_cutover_date,
    target_broker_balance_cents => target_broker_balance_cents,
    target_funding_pending_cents => 0,
    target_contributed_capital_cents => 0,
    target_personal_withdrawals_cents => 0,
    target_floating_cents => target_floating_cents,
    target_virgin_accounts => 0,
    target_live_evaluation_accounts => 0,
    target_funded_accounts => 0,
    target_closed_accounts_reference => 0,
    target_batches => '[]'::jsonb,
    target_wallets => target_wallets
  );

  for account_value in select value from jsonb_array_elements(target_accounts)
  loop
    selected_company_id := (account_value ->> 'companyId')::uuid;
    selected_connector_id := (account_value ->> 'connectorId')::uuid;
    selected_connection_name := btrim(account_value ->> 'connectionName');
    selected_account_name := btrim(account_value ->> 'accountName');
    selected_first_seen_at := (account_value ->> 'firstSeenAt')::timestamptz;
    selected_phase := account_value ->> 'phase';

    select coalesce(max(purchases.purchase_number), 0) + 1
    into next_purchase_number
    from public.purchases purchases
    where purchases.period_id = target_period_id;

    select coalesce(max(accounts.reference_number), 0) + 1
    into next_reference_number
    from public.accounts accounts
    where accounts.workspace_id = selected_workspace_id
      and accounts.company_id = selected_company_id;

    insert into public.accounts(
      period_id, company_id, reference_number, state, state_origin, created_by, updated_by
    ) values (
      target_period_id, selected_company_id, next_reference_number,
      'live', 'automatic', actor_id, actor_id
    ) returning id into new_account_id;

    insert into public.purchases(
      period_id, account_id, purchase_number, purchased_on, price_cents,
      funds_origin, created_by, updated_by
    ) values (
      target_period_id, new_account_id, next_purchase_number, target_cutover_date,
      0, 'Aporte trader', actor_id, actor_id
    ) returning id into new_purchase_id;

    insert into public.ninja_account_links(
      account_id, connector_id, connection_name, external_account_name,
      first_seen_at, linked_by, phase
    ) values (
      new_account_id, selected_connector_id, selected_connection_name,
      selected_account_name, selected_first_seen_at, actor_id, selected_phase
    );

    insert into public.audit_events(
      actor_user_id, entity_table, entity_id, action, current_data, reason
    ) values (
      actor_id, 'accounts', new_account_id, 'simplified_opening_account_registered',
      jsonb_build_object(
        'period_id', target_period_id,
        'purchase_id', new_purchase_id,
        'connector_id', selected_connector_id,
        'connection_name', selected_connection_name,
        'external_account_name', selected_account_name,
        'phase', selected_phase,
        'baseline_price_cents', 0
      ),
      'Cuenta abierta incorporada como base del nuevo inicio simplificado'
    );
  end loop;

  return snapshot_id;
end;
$$;

revoke all on function public.confirm_nodal_simplified_opening(
  uuid,date,bigint,bigint,jsonb,jsonb
) from public, anon;
grant execute on function public.confirm_nodal_simplified_opening(
  uuid,date,bigint,bigint,jsonb,jsonb
) to authenticated;

comment on function public.confirm_nodal_simplified_opening(
  uuid,date,bigint,bigint,jsonb,jsonb
) is 'Reemplaza la apertura y los registros de cuenta sin actividad por las cuentas actualmente observadas por Ninja, preservando identidades y conectores.';
