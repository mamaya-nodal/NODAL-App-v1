-- El primer cierre automatico de un periodo puede no tener todavia un
-- movimiento broker anterior. En ese caso la apertura confirmada es la
-- referencia contable, sin crear un deposito ni pedir una carga manual.

create or replace function public.commit_ninja_automatic_operation_batch(target_batch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_batch public.ninja_operation_batches%rowtype;
  broker_session public.ninja_operation_probe_sessions%rowtype;
  owner_id uuid;
  prior_control public.daily_controls%rowtype;
  new_control_id uuid;
  leader_id uuid;
  next_control_number integer;
  source_key text;
  opening_cents bigint;
  opening_snapshot_balance_cents bigint;
  prior_balance_cents bigint;
  subaccount_closing_cents bigint;
  accounting_closing_cents bigint;
  received_closing_cents bigint;
  member_count integer;
  sync_reason text;
  has_prior_control boolean := false;
begin
  select * into selected_batch
  from public.ninja_operation_batches batches
  where batches.id = target_batch_id
  for update;
  if not found then raise exception 'Automatic Ninja batch does not exist'; end if;

  select * into broker_session
  from public.ninja_operation_probe_sessions sessions
  where sessions.id = selected_batch.broker_session_id and sessions.status = 'closed';
  if not found or broker_session.opening_balance is null or broker_session.closing_balance is null then
    raise exception 'Broker session has incomplete balances';
  end if;
  source_key := 'ninja-operation:' || broker_session.opening_event_id::text;

  select controls.id into new_control_id
  from public.daily_controls controls
  where controls.period_id = selected_batch.accounting_period_id
    and controls.source = 'ninjatrader' and controls.source_event_key = source_key;
  if new_control_id is not null then
    update public.ninja_operation_batches batches
    set accounting_mode = 'active', accounting_status = 'committed',
      accounting_blocking_reason = null, daily_control_id = new_control_id, updated_at = now()
    where batches.id = selected_batch.id;
    return new_control_id;
  end if;

  if selected_batch.status <> 'ready' or selected_batch.accounting_status <> 'shadow_ready'
    or selected_batch.accounting_period_id is null or selected_batch.accounting_company_id is null
    or selected_batch.accounting_phase is null or selected_batch.operated_on is null then
    raise exception 'Automatic Ninja batch is not ready';
  end if;

  select connectors.owner_user_id into owner_id
  from public.ninja_connectors connectors
  where connectors.id = selected_batch.connector_id and connectors.status = 'active';
  if owner_id is null then raise exception 'Connector owner is not active'; end if;

  opening_cents := round(broker_session.opening_balance * 100)::bigint;
  subaccount_closing_cents := round(broker_session.closing_balance * 100)::bigint;
  if subaccount_closing_cents - opening_cents <> selected_batch.broker_result_cents then
    raise exception 'Broker session result does not reconcile';
  end if;

  select count(*)::integer into member_count
  from public.ninja_operation_batch_members members
  join public.accounts accounts on accounts.id = members.account_id
  where members.batch_id = selected_batch.id and members.role = 'prop'
    and accounts.period_id = selected_batch.accounting_period_id
    and accounts.company_id = selected_batch.accounting_company_id;
  if member_count = 0 or member_count <> (
    select count(*) from public.ninja_operation_batch_members members
    where members.batch_id = selected_batch.id and members.role = 'prop'
  ) then raise exception 'Automatic Ninja members are inconsistent'; end if;

  select members.account_id into leader_id
  from public.ninja_operation_batch_members members
  join public.accounts accounts on accounts.id = members.account_id
  where members.batch_id = selected_batch.id and members.role = 'prop'
  order by accounts.reference_number, members.account_id
  limit 1;

  select * into prior_control
  from public.daily_controls controls
  where controls.period_id = selected_batch.accounting_period_id
  order by controls.control_number desc
  limit 1
  for update;

  if found then
    has_prior_control := true;
    prior_balance_cents := prior_control.balance_after_cents;
    next_control_number := prior_control.control_number + 1;
  else
    select snapshots.broker_balance_cents into opening_snapshot_balance_cents
    from public.period_opening_snapshots snapshots
    where snapshots.period_id = selected_batch.accounting_period_id;
    if opening_snapshot_balance_cents is null then
      raise exception 'Broker opening balance is missing';
    end if;
    prior_balance_cents := opening_snapshot_balance_cents;
    next_control_number := 1;
  end if;

  if selected_batch.broker_balance_scope = 'aggregate' then
    accounting_closing_cents := prior_balance_cents + selected_batch.broker_result_cents;
    received_closing_cents := accounting_closing_cents;
    sync_reason := null;
  elsif prior_balance_cents = opening_cents then
    accounting_closing_cents := subaccount_closing_cents;
    received_closing_cents := subaccount_closing_cents;
    sync_reason := null;
  elsif has_prior_control
    and prior_control.received_balance_cents = opening_cents
    and prior_control.sync_issue_reason is not null then
    accounting_closing_cents := prior_control.balance_after_cents + selected_batch.broker_result_cents;
    received_closing_cents := subaccount_closing_cents;
    sync_reason := 'Continuidad automática sobre una diferencia de sincronización previamente documentada.';
  else
    raise exception 'Broker opening balance no longer matches accounting';
  end if;

  insert into public.daily_controls(
    period_id, control_number, operated_on, kind, balance_before_cents,
    balance_after_cents, operating_result_cents, company_id, leader_account_id,
    phase, observations, source, source_event_key, received_balance_cents,
    sync_issue_reason, confirmation_key, created_by
  ) values (
    selected_batch.accounting_period_id, next_control_number, selected_batch.operated_on,
    'balance_update', prior_balance_cents, accounting_closing_cents,
    selected_batch.broker_result_cents, selected_batch.accounting_company_id, leader_id,
    selected_batch.accounting_phase,
    case when selected_batch.broker_balance_scope = 'aggregate'
      then 'Resultado de subcuenta aplicado automáticamente al saldo broker total.'
      else 'Cierre registrado automáticamente desde NinjaTrader.' end,
    'ninjatrader', source_key, received_closing_cents, sync_reason,
    selected_batch.id, owner_id
  ) returning id into new_control_id;

  insert into public.daily_control_participants(
    daily_control_id, period_id, account_id, role, allocated_result_cents
  )
  select new_control_id, selected_batch.accounting_period_id, members.account_id,
    case when members.account_id = leader_id then 'leader'::public.daily_control_participant_role
      else 'replica'::public.daily_control_participant_role end,
    members.allocated_broker_result_cents
  from public.ninja_operation_batch_members members
  where members.batch_id = selected_batch.id and members.role = 'prop';

  insert into public.operation_entries(
    period_id, daily_control_id, account_id, operated_on, phase,
    participant_role, destination, magnitude_cents, created_by
  )
  select selected_batch.accounting_period_id, new_control_id, members.account_id,
    selected_batch.operated_on, selected_batch.accounting_phase,
    case when members.account_id = leader_id then 'leader'::public.daily_control_participant_role
      else 'replica'::public.daily_control_participant_role end,
    case when members.allocated_broker_result_cents > 0 then 'NETO BROKER +'::public.broker_result_destination
      when members.allocated_broker_result_cents < 0 then 'NETO BROKER -'::public.broker_result_destination
      else 'NONE'::public.broker_result_destination end,
    abs(members.allocated_broker_result_cents), owner_id
  from public.ninja_operation_batch_members members
  where members.batch_id = selected_batch.id and members.role = 'prop';

  update public.ninja_broker_balance_events events
  set status = 'confirmed', daily_control_id = new_control_id,
    resolved_at = coalesce(events.resolved_at, now())
  where events.connector_id = selected_batch.connector_id
    and events.source_event_id = source_key;

  update public.ninja_operation_batches batches
  set accounting_mode = 'active', accounting_status = 'committed',
    accounting_blocking_reason = null, daily_control_id = new_control_id, updated_at = now()
  where batches.id = selected_batch.id;

  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values(owner_id, 'daily_controls', new_control_id, 'ninja_operation_automatically_committed',
    jsonb_build_object('batch_id', selected_batch.id,
      'broker_balance_scope', selected_batch.broker_balance_scope,
      'balance_source', case when has_prior_control then 'previous_control' else 'period_opening' end,
      'subaccount_opening_balance_cents', opening_cents,
      'subaccount_closing_balance_cents', subaccount_closing_cents,
      'accounting_closing_balance_cents', accounting_closing_cents,
      'participant_count', member_count,
      'rounding_difference_cents', selected_batch.rounding_difference_cents),
    'Operación cerrada, correlacionada y conciliada automáticamente desde NinjaTrader');
  return new_control_id;
end;
$$;

revoke all on function public.commit_ninja_automatic_operation_batch(uuid)
from public, anon, authenticated;
grant execute on function public.commit_ninja_automatic_operation_batch(uuid)
to service_role;

-- Recupera solamente primeros cierres que ya estaban completamente
-- correlacionados y cuyo saldo inicial coincide con la apertura confirmada.
do $$
declare
  candidate record;
begin
  for candidate in
    select batches.id
    from public.ninja_operation_batches batches
    join public.ninja_operation_probe_sessions sessions
      on sessions.id = batches.broker_session_id
    join public.period_opening_snapshots snapshots
      on snapshots.period_id = batches.accounting_period_id
    where batches.status = 'ready'
      and batches.accounting_status = 'shadow_ready'
      and batches.accounting_blocking_reason = 'El cierre quedó conciliado, pero no pudo registrarse automáticamente.'
      and sessions.status = 'closed'
      and snapshots.broker_balance_cents is not null
      and not exists (
        select 1 from public.daily_controls controls
        where controls.period_id = batches.accounting_period_id
      )
      and (
        batches.broker_balance_scope = 'aggregate'
        or round(sessions.opening_balance * 100)::bigint = snapshots.broker_balance_cents
      )
    order by batches.opened_at, batches.id
  loop
    perform public.commit_ninja_automatic_operation_batch(candidate.id);
  end loop;
end;
$$;
