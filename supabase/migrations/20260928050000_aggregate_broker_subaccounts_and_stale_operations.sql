-- Una operación de una subcuenta broker reconcilia contra sus propios saldos,
-- pero su resultado impacta el saldo broker total. Además, un conector sin
-- señal no mantiene posiciones antiguas como si todavía estuvieran operando.

alter table public.ninja_operation_batches
  add column if not exists broker_balance_scope text not null default 'single';

alter table public.ninja_operation_batches
  drop constraint if exists ninja_operation_batches_broker_balance_scope_check;
alter table public.ninja_operation_batches
  add constraint ninja_operation_batches_broker_balance_scope_check
  check (broker_balance_scope in ('single', 'aggregate'));

comment on column public.ninja_operation_batches.broker_balance_scope is
  'single compara el saldo de la sesión con la contabilidad; aggregate aplica el resultado de una subcuenta al saldo broker total.';

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
  subaccount_closing_cents bigint;
  accounting_closing_cents bigint;
  received_closing_cents bigint;
  member_count integer;
  sync_reason text;
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
  if not found then raise exception 'Broker opening balance is missing'; end if;

  if selected_batch.broker_balance_scope = 'aggregate' then
    accounting_closing_cents := prior_control.balance_after_cents + selected_batch.broker_result_cents;
    received_closing_cents := accounting_closing_cents;
    sync_reason := null;
  elsif prior_control.balance_after_cents = opening_cents then
    accounting_closing_cents := subaccount_closing_cents;
    received_closing_cents := subaccount_closing_cents;
    sync_reason := null;
  elsif prior_control.received_balance_cents = opening_cents
    and prior_control.sync_issue_reason is not null then
    accounting_closing_cents := prior_control.balance_after_cents + selected_batch.broker_result_cents;
    received_closing_cents := subaccount_closing_cents;
    sync_reason := 'Continuidad automática sobre una diferencia de sincronización previamente documentada.';
  else
    raise exception 'Broker opening balance no longer matches accounting';
  end if;
  next_control_number := prior_control.control_number + 1;

  insert into public.daily_controls(
    period_id, control_number, operated_on, kind, balance_before_cents,
    balance_after_cents, operating_result_cents, company_id, leader_account_id,
    phase, observations, source, source_event_key, received_balance_cents,
    sync_issue_reason, confirmation_key, created_by
  ) values (
    selected_batch.accounting_period_id, next_control_number, selected_batch.operated_on,
    'balance_update', prior_control.balance_after_cents, accounting_closing_cents,
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

create or replace function public.get_current_user_ninja_trade_telemetry(target_limit integer default 100)
returns table (
  id bigint,
  event_type text,
  occurred_at timestamptz,
  connection_name text,
  account_name text,
  instrument text,
  payload jsonb
)
language sql
security definer
set search_path = ''
stable
as $$
  with ranked_events as (
    select events.id, events.event_type, events.occurred_at, events.connection_name,
      events.account_name, events.instrument, events.payload,
      row_number() over (
        partition by events.connector_id, events.connection_name, events.account_name, events.event_type
        order by events.occurred_at desc, events.id desc
      ) as event_type_rank
    from public.ninja_trade_telemetry_events events
    join public.ninja_connectors connectors on connectors.id = events.connector_id
    where connectors.owner_user_id = (select auth.uid())
      and connectors.status = 'active'
      and connectors.last_seen_at >= now() - interval '2 minutes'
  )
  select ranked.id, ranked.event_type, ranked.occurred_at, ranked.connection_name,
    ranked.account_name, ranked.instrument, ranked.payload
  from ranked_events ranked
  where ranked.event_type <> 'balance' or ranked.event_type_rank <= 10
  order by ranked.occurred_at desc, ranked.id desc
  limit least(greatest(coalesce(target_limit, 100), 1), 200);
$$;

revoke all on function public.get_current_user_ninja_trade_telemetry(integer) from public, anon;
grant execute on function public.get_current_user_ninja_trade_telemetry(integer) to authenticated;

create or replace function public.get_current_user_ninja_operation_probe_sessions(target_limit integer default 20)
returns table (
  id bigint,
  connection_name text,
  account_name text,
  opened_at timestamptz,
  flat_at timestamptz,
  settled_at timestamptz,
  status text,
  opening_balance numeric,
  closing_balance numeric,
  minimum_net_liquidation numeric,
  minimum_net_liquidation_at timestamptz,
  result numeric,
  execution_count integer,
  instruments text[]
)
language sql
security definer
set search_path = ''
stable
as $$
  select sessions.id, sessions.connection_name, sessions.account_name,
    sessions.opened_at, sessions.flat_at, sessions.settled_at, sessions.status,
    sessions.opening_balance, sessions.closing_balance,
    sessions.minimum_net_liquidation, sessions.minimum_net_liquidation_at,
    sessions.result, sessions.execution_count, sessions.instruments
  from public.ninja_operation_probe_sessions sessions
  join public.ninja_connectors connectors on connectors.id = sessions.connector_id
  where connectors.owner_user_id = (select auth.uid())
    and connectors.status = 'active'
    and sessions.excluded_at is null
    and (sessions.status = 'closed' or connectors.last_seen_at >= now() - interval '2 minutes')
  order by sessions.opened_at desc, sessions.id desc
  limit least(greatest(coalesce(target_limit, 20), 1), 100);
$$;

revoke all on function public.get_current_user_ninja_operation_probe_sessions(integer)
from public, anon;
grant execute on function public.get_current_user_ninja_operation_probe_sessions(integer)
to authenticated;

-- Recupera lotes que quedaron bloqueados únicamente por comparar una
-- subcuenta con el total. La función conserva las cuentas reales ya asignadas.
do $$
declare
  candidate record;
begin
  for candidate in
    select batches.id
    from public.ninja_operation_batches batches
    join public.ninja_connectors connectors on connectors.id = batches.connector_id
    join public.ninja_operation_probe_sessions broker_session on broker_session.id = batches.broker_session_id
    where batches.status = 'ready'
      and batches.accounting_status = 'blocked'
      and batches.accounting_blocking_reason = 'El saldo inicial no coincide con el último saldo contable'
      and broker_session.status = 'closed'
      and round((broker_session.closing_balance - broker_session.opening_balance) * 100)::bigint = batches.broker_result_cents
      and (select count(distinct other_session.account_name)
           from public.ninja_operation_batches other_batch
           join public.ninja_connectors other_connector on other_connector.id = other_batch.connector_id
           join public.ninja_operation_probe_sessions other_session on other_session.id = other_batch.broker_session_id
           where other_connector.owner_user_id = connectors.owner_user_id) > 1
  loop
    update public.ninja_operation_batches
    set broker_balance_scope = 'aggregate', accounting_status = 'shadow_ready',
      accounting_blocking_reason = null, updated_at = now()
    where id = candidate.id;
    perform public.commit_ninja_automatic_operation_batch(candidate.id);
  end loop;
end;
$$;
