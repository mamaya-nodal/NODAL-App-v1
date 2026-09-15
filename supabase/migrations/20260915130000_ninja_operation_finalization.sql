-- El cierre técnico de Ninja se convierte en un registro contable idempotente.
-- También conserva el mínimo de Net Liquidation que prueba una quema aunque
-- el Cash Value plano final quede algunos dólares por encima del piso.

alter table public.ninja_operation_probe_sessions
  add column if not exists minimum_net_liquidation numeric,
  add column if not exists minimum_net_liquidation_at timestamptz;

alter table public.ninja_operation_probe_sessions
  drop constraint if exists ninja_operation_probe_minimum_complete;
alter table public.ninja_operation_probe_sessions
  add constraint ninja_operation_probe_minimum_complete check (
    (minimum_net_liquidation is null and minimum_net_liquidation_at is null)
    or (minimum_net_liquidation is not null and minimum_net_liquidation_at is not null)
  );

create or replace function public.recalculate_nodal_account_state(target_account_id uuid)
returns public.account_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_period_id uuid;
  target_origin public.account_state_origin;
  target_created_by uuid;
  previous_state public.account_state;
  calculated_state public.account_state;
  purchase_price_cents bigint := 0;
  phase_positive_cents bigint;
  phase_negative_cents bigint;
  phase_withdrawal_cents bigint;
  phase_total_gain_cents bigint;
  previous_phase_total_cents bigint := 0;
  carry_cents bigint;
  phase_name public.operation_phase;
  phase_index integer;
  has_operational_data boolean;
  has_positive_total boolean := false;
  has_automatic_burn boolean := false;
begin
  select accounts.period_id, accounts.state_origin, accounts.created_by, accounts.state
  into target_period_id, target_origin, target_created_by, previous_state
  from public.accounts as accounts
  where accounts.id = target_account_id
  for update;
  if target_period_id is null then raise exception 'account does not exist'; end if;

  select exists (
    select 1 from public.ninja_account_links links
    where links.account_id = target_account_id and links.closure_reason = 'burned'
  ) into has_automatic_burn;

  select coalesce((
    select purchases.price_cents
    from public.purchases as purchases
    where purchases.account_id = target_account_id
  ), 0) into purchase_price_cents;

  if target_origin = 'manual_live' then calculated_state := 'live';
  elsif target_origin = 'manual_closed' then calculated_state := 'closed';
  elsif has_automatic_burn then calculated_state := 'closed';
  else
    select exists (select 1 from public.operation_entries entries where entries.account_id = target_account_id)
      or exists (select 1 from public.account_phase_withdrawals withdrawals where withdrawals.account_id = target_account_id)
    into has_operational_data;

    for phase_name, phase_index in
      select phases.phase::public.operation_phase, phases.ordinality::integer
      from unnest(array['Evaluacion','Primera vuelta','Segunda vuelta','Tercera vuelta','Cuarta vuelta','Quinta vuelta']::text[])
        with ordinality as phases(phase, ordinality)
    loop
      select
        coalesce(sum(entries.magnitude_cents) filter (where entries.destination = 'NETO BROKER +'), 0),
        coalesce(sum(entries.magnitude_cents) filter (where entries.destination = 'NETO BROKER -'), 0)
      into phase_positive_cents, phase_negative_cents
      from public.operation_entries entries
      where entries.account_id = target_account_id and entries.phase = phase_name;

      if phase_name = 'Evaluacion' then
        phase_negative_cents := phase_negative_cents + purchase_price_cents;
        phase_withdrawal_cents := 0;
      else
        select coalesce(withdrawals.total_withdrawal_cents, 0)
        into phase_withdrawal_cents
        from public.account_phase_withdrawals withdrawals
        where withdrawals.account_id = target_account_id and withdrawals.phase = phase_name;
        phase_withdrawal_cents := coalesce(phase_withdrawal_cents, 0);
      end if;

      carry_cents := case
        when phase_index = 1 then 0
        when previous_phase_total_cents < 0 then previous_phase_total_cents
        when target_origin = 'manual_live' and previous_phase_total_cents > 0 then previous_phase_total_cents
        else 0
      end;
      phase_total_gain_cents := phase_positive_cents - phase_negative_cents + phase_withdrawal_cents + carry_cents;
      previous_phase_total_cents := phase_total_gain_cents;
      has_positive_total := has_positive_total or phase_total_gain_cents > 0;
    end loop;

    calculated_state := case when has_positive_total then 'closed'::public.account_state
      when has_operational_data then 'live'::public.account_state else 'virgin'::public.account_state end;
  end if;

  if previous_state is distinct from calculated_state then
    update public.accounts set state = calculated_state,
      updated_by = coalesce((select auth.uid()), target_created_by)
    where id = target_account_id;
  end if;
  return calculated_state;
end;
$$;

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
  closing_cents bigint;
  member_count integer;
begin
  select * into selected_batch
  from public.ninja_operation_batches batches
  where batches.id = target_batch_id
  for update;
  if not found then raise exception 'Automatic Ninja batch does not exist'; end if;
  if selected_batch.accounting_status = 'committed' then return selected_batch.daily_control_id; end if;
  if selected_batch.status <> 'ready' or selected_batch.accounting_status <> 'shadow_ready'
    or selected_batch.accounting_period_id is null or selected_batch.accounting_company_id is null
    or selected_batch.accounting_phase is null or selected_batch.operated_on is null then
    raise exception 'Automatic Ninja batch is not ready';
  end if;

  select connectors.owner_user_id into owner_id
  from public.ninja_connectors connectors
  where connectors.id = selected_batch.connector_id and connectors.status = 'active';
  if owner_id is null then raise exception 'Connector owner is not active'; end if;

  select * into broker_session
  from public.ninja_operation_probe_sessions sessions
  where sessions.id = selected_batch.broker_session_id and sessions.status = 'closed';
  if not found or broker_session.opening_balance is null or broker_session.closing_balance is null then
    raise exception 'Broker session has incomplete balances';
  end if;
  opening_cents := round(broker_session.opening_balance * 100)::bigint;
  closing_cents := round(broker_session.closing_balance * 100)::bigint;
  if closing_cents - opening_cents <> selected_batch.broker_result_cents then
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
  if not found or prior_control.balance_after_cents <> opening_cents then
    raise exception 'Broker opening balance no longer matches accounting';
  end if;
  next_control_number := prior_control.control_number + 1;
  source_key := 'ninja-operation:' || broker_session.opening_event_id::text;

  select controls.id into new_control_id
  from public.daily_controls controls
  where controls.period_id = selected_batch.accounting_period_id
    and controls.source = 'ninjatrader' and controls.source_event_key = source_key;
  if new_control_id is null then
    insert into public.daily_controls(
      period_id, control_number, operated_on, kind, balance_before_cents,
      balance_after_cents, operating_result_cents, company_id, leader_account_id,
      phase, observations, source, source_event_key, received_balance_cents,
      confirmation_key, created_by
    ) values (
      selected_batch.accounting_period_id, next_control_number, selected_batch.operated_on,
      'balance_update', opening_cents, closing_cents, selected_batch.broker_result_cents,
      selected_batch.accounting_company_id, leader_id, selected_batch.accounting_phase,
      'Cierre registrado automáticamente desde NinjaTrader.', 'ninjatrader', source_key,
      closing_cents, selected_batch.id, owner_id
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

    insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
    values(owner_id, 'daily_controls', new_control_id, 'ninja_operation_automatically_committed',
      jsonb_build_object('batch_id', selected_batch.id, 'opening_balance_cents', opening_cents,
        'closing_balance_cents', closing_cents, 'participant_count', member_count,
        'rounding_difference_cents', selected_batch.rounding_difference_cents),
      'Operación cerrada, correlacionada y conciliada automáticamente desde NinjaTrader');
  end if;

  update public.ninja_broker_balance_events events
  set status = 'confirmed', daily_control_id = new_control_id, resolved_at = coalesce(events.resolved_at, now())
  where events.connector_id = selected_batch.connector_id and events.source_event_id = source_key;

  update public.ninja_operation_batches batches
  set accounting_mode = 'active', accounting_status = 'committed',
    accounting_blocking_reason = null, daily_control_id = new_control_id, updated_at = now()
  where batches.id = selected_batch.id;
  return new_control_id;
end;
$$;

revoke all on function public.commit_ninja_automatic_operation_batch(uuid)
from public, anon, authenticated;
grant execute on function public.commit_ninja_automatic_operation_batch(uuid)
to service_role;

comment on function public.commit_ninja_automatic_operation_batch(uuid) is
  'Commits one reconciled Ninja operation to Control Diario and Registro exactly once.';

drop function if exists public.get_current_user_ninja_operation_probe_sessions(integer);
create function public.get_current_user_ninja_operation_probe_sessions(target_limit integer default 20)
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
  order by sessions.opened_at desc, sessions.id desc
  limit least(greatest(coalesce(target_limit, 20), 1), 100);
$$;

revoke all on function public.get_current_user_ninja_operation_probe_sessions(integer)
from public, anon;
grant execute on function public.get_current_user_ninja_operation_probe_sessions(integer)
to authenticated;
