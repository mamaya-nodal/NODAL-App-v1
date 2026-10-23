-- Inicio simplificado: reemplaza la apertura anterior y registra las cuentas
-- que Ninja informa en ese momento como una base, sin volver a computar sus
-- compras históricas. Las cuentas ya registradas se conservan.

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
    ) then raise exception 'SIMPLIFIED_OPENING_ACCOUNT_INVALID'; end if;
  end loop;

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
) is 'Reemplaza una apertura autorizada y registra como base las cuentas actualmente observadas por Ninja, sin recomputar sus compras previas.';

-- Julián fue autorizado como piloto por Admin Master. La aprobación queda
-- auditada y sólo puede consumirse una vez por el flujo anterior.
with pilot_request as (
  insert into public.period_opening_revision_requests(
    period_id, opening_snapshot_id, requested_by, status,
    requested_at, reviewed_by, reviewed_at, review_reason
  )
  select
    periods.id,
    snapshots.id,
    '0c90d147-a048-48c9-8f89-e095bbadc249'::uuid,
    'approved',
    now(),
    'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid,
    now(),
    'Piloto autorizado del nuevo inicio simplificado'
  from public.periods periods
  join public.workspaces spaces on spaces.id = periods.workspace_id
  join public.period_opening_snapshots snapshots on snapshots.period_id = periods.id
  where periods.id = '2403879b-4f3a-437f-92af-3e7f5606b2e9'::uuid
    and spaces.owner_user_id = '0c90d147-a048-48c9-8f89-e095bbadc249'::uuid
    and snapshots.id = '3c4d1282-2006-4b35-81b1-9061188b8282'::uuid
    and snapshots.revision_number = 1
    and not public.nodal_period_opening_has_activity(periods.id)
    and not exists (
      select 1 from public.period_opening_revision_requests existing
      where existing.period_id = periods.id and existing.status in ('pending', 'approved')
    )
  returning id, period_id, opening_snapshot_id, requested_by, reviewed_by
)
insert into public.audit_events(
  actor_user_id, entity_table, entity_id, action, current_data, reason
)
select
  pilot_request.reviewed_by,
  'period_opening_revision_requests',
  pilot_request.id,
  'period_opening_revision_approved',
  jsonb_build_object(
    'period_id', pilot_request.period_id,
    'opening_snapshot_id', pilot_request.opening_snapshot_id,
    'requested_by', pilot_request.requested_by,
    'status', 'approved',
    'pilot', 'simplified_opening'
  ),
  'Piloto autorizado del nuevo inicio simplificado'
from pilot_request;
