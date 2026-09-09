-- Equivalencia contable verificada contra Sheets: arrastres, payouts, redondeo
-- y persistencia del lote automático prop/cobertura.

alter table public.funding_withdrawals
  add column if not exists phase public.operation_phase;

alter table public.ninja_operation_probe_sessions
  add column if not exists direction text check (direction in ('Long', 'Short')),
  add column if not exists quantity integer not null default 0 check (quantity >= 0);

create table if not exists public.ninja_operation_batches (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references public.ninja_connectors(id) on delete cascade,
  broker_session_id bigint not null references public.ninja_operation_probe_sessions(id) on delete cascade,
  status text not null check (status in ('ready', 'unmatched', 'conflict')),
  broker_result_cents bigint not null,
  distributed_cents bigint not null default 0,
  rounding_difference_cents bigint not null default 0,
  opened_at timestamptz not null,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connector_id, broker_session_id)
);

create table if not exists public.ninja_operation_batch_members (
  batch_id uuid not null references public.ninja_operation_batches(id) on delete cascade,
  session_id bigint not null references public.ninja_operation_probe_sessions(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete restrict,
  role text not null check (role in ('broker', 'prop')),
  allocated_broker_result_cents bigint,
  primary key (batch_id, session_id),
  unique (session_id),
  constraint ninja_batch_member_account_role check (
    (role = 'broker' and account_id is null and allocated_broker_result_cents is null)
    or (role = 'prop' and account_id is not null and allocated_broker_result_cents is not null)
  )
);

alter table public.ninja_operation_batches enable row level security;
alter table public.ninja_operation_batch_members enable row level security;
revoke all on table public.ninja_operation_batches, public.ninja_operation_batch_members
  from public, anon, authenticated;

create or replace function public.nodal_opening_broker_balance(target_period_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select controls.balance_after_cents
  from public.periods as current_period
  join public.periods as earlier_period
    on earlier_period.workspace_id = current_period.workspace_id
    and earlier_period.period_month < current_period.period_month
  join public.daily_controls as controls on controls.period_id = earlier_period.id
  where current_period.id = target_period_id
    and public.can_access_period(target_period_id)
  order by earlier_period.period_month desc, controls.control_number desc
  limit 1
$$;

revoke all on function public.nodal_opening_broker_balance(uuid)
  from public, anon, authenticated;

-- El inventario sólo identifica cuentas. Los pendientes generados por la vieja
-- igualdad CashValue = NetLiquidation quedan anulados sin borrar su auditoría.
alter table public.ninja_broker_balance_events
  drop constraint if exists ninja_broker_balance_events_status_check;
alter table public.ninja_broker_balance_events
  add constraint ninja_broker_balance_events_status_check
  check (status in ('pending', 'confirmed', 'superseded'));
alter table public.ninja_broker_balance_events
  drop constraint if exists ninja_broker_balance_event_resolution_consistent;
alter table public.ninja_broker_balance_events
  add constraint ninja_broker_balance_event_resolution_consistent check (
    (status in ('pending', 'superseded') and daily_control_id is null and resolved_at is null)
    or (status = 'confirmed' and daily_control_id is not null and resolved_at is not null)
  );
update public.ninja_broker_balance_events set status = 'superseded' where status = 'pending';

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
begin
  select accounts.period_id, accounts.state_origin, accounts.created_by, accounts.state
  into target_period_id, target_origin, target_created_by, previous_state
  from public.accounts as accounts
  where accounts.id = target_account_id
  for update;
  if target_period_id is null then raise exception 'account does not exist'; end if;

  select coalesce((
    select purchases.price_cents
    from public.purchases as purchases
    where purchases.account_id = target_account_id
  ), 0) into purchase_price_cents;

  if target_origin = 'manual_live' then calculated_state := 'live';
  elsif target_origin = 'manual_closed' then calculated_state := 'closed';
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

create or replace function public.create_nodal_funding_withdrawal(
  target_period_id uuid,
  target_account_id uuid,
  target_approved_on date,
  target_amount_cents bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  new_id uuid;
  period_month date;
  target_phase public.operation_phase;
  prior_phase_total bigint := 0;
begin
  if actor_id is null or not public.can_access_period(target_period_id) then
    raise exception 'selected period is not accessible';
  end if;
  select periods.period_month into period_month from public.periods periods where periods.id = target_period_id;
  if date_trunc('month', target_approved_on)::date <> period_month or target_amount_cents <= 0
    or not exists(select 1 from public.accounts where id = target_account_id and period_id = target_period_id)
  then raise exception 'funding withdrawal is invalid for this period'; end if;

  select entries.phase into target_phase
  from public.operation_entries entries
  where entries.account_id = target_account_id and entries.phase <> 'Evaluacion'
  order by array_position(array['Evaluacion','Primera vuelta','Segunda vuelta','Tercera vuelta','Cuarta vuelta','Quinta vuelta']::public.operation_phase[], entries.phase) desc,
    entries.operated_on desc, entries.created_at desc
  limit 1;
  if target_phase is null then
    raise exception 'funding withdrawal requires an active funded turn';
  end if;

  insert into public.funding_withdrawals(period_id, account_id, approved_on, amount_cents, phase, created_by, updated_by)
  values(target_period_id, target_account_id, target_approved_on, target_amount_cents, target_phase, actor_id, actor_id)
  returning id into new_id;

  select coalesce(withdrawals.total_withdrawal_cents, 0) into prior_phase_total
  from public.account_phase_withdrawals withdrawals
  where withdrawals.account_id = target_account_id and withdrawals.phase = target_phase;
  prior_phase_total := coalesce(prior_phase_total, 0);

  insert into public.account_phase_withdrawals(period_id, account_id, phase, total_withdrawal_cents, created_by, updated_by)
  values(target_period_id, target_account_id, target_phase, prior_phase_total + target_amount_cents, actor_id, actor_id)
  on conflict(account_id, phase) do update set
    total_withdrawal_cents = excluded.total_withdrawal_cents,
    updated_by = actor_id;

  perform public.recalculate_nodal_account_state(target_account_id);
  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values(actor_id, 'funding_withdrawals', new_id, 'funding_withdrawal_approved', jsonb_build_object(
    'period_id', target_period_id, 'account_id', target_account_id,
    'amount_cents', target_amount_cents, 'approved_on', target_approved_on,
    'phase', target_phase, 'phase_total_withdrawal_cents', prior_phase_total + target_amount_cents
  ), 'Payout aprobado y aplicado atómicamente a TOTAL RETIRO');
  return new_id;
end;
$$;

-- Actualiza funciones ya instaladas para usar el redondeo de Sheets. Los
-- archivos históricos también fueron corregidos para bases nuevas.
do $$
declare
  definition text;
  changed boolean;
begin
  select pg_get_functiondef('public.confirm_nodal_daily_control(uuid,public.daily_control_kind,date,uuid,bigint,bigint,public.daily_control_origin_destination,uuid,uuid,uuid[],public.operation_phase,text,public.daily_control_source,text,bigint,text)'::regprocedure)
  into definition;
  changed := false;
  if position('if mod(calculated_result, participant_count) <> 0' in definition) > 0 then
    definition := regexp_replace(
      definition,
      'if mod\(calculated_result, participant_count\) <> 0 then\s+raise exception ''The result cannot be divided into exact cents'';\s+end if;\s+allocated_result := calculated_result / participant_count;',
      'allocated_result := sign(calculated_result) * round(abs(calculated_result)::numeric / participant_count);'
    );
    changed := true;
  end if;
  if position('nodal_opening_broker_balance' in definition) = 0 then
    definition := replace(
      definition,
      E'  select controls.control_number, controls.operated_on, controls.balance_after_cents\n  into prior_control\n  from public.daily_controls as controls\n  where controls.period_id = target_period_id\n  order by controls.control_number desc\n  limit 1;',
      E'  select controls.control_number, controls.operated_on, controls.balance_after_cents\n  into prior_control\n  from public.daily_controls as controls\n  where controls.period_id = target_period_id\n  order by controls.control_number desc\n  limit 1;\n\n  if not found then\n    select 0 as control_number, selected_period_month as operated_on,\n      public.nodal_opening_broker_balance(target_period_id) as balance_after_cents\n    into prior_control;\n  end if;'
    );
    changed := true;
  end if;
  if changed then
    execute definition;
  end if;

  select pg_get_functiondef('public.correct_nodal_daily_control_balance_with_allocations(uuid,uuid,bigint,text,jsonb)'::regprocedure)
  into definition;
  changed := false;
  if position('if mod(calculated_result, participant_count) <> 0' in definition) > 0 then
    definition := regexp_replace(
      definition,
      'if mod\(calculated_result, participant_count\) <> 0 then\s+raise exception ''The correction creates a result that cannot be divided into exact cents'';\s+end if;\s+allocated_result := calculated_result / participant_count;',
      'allocated_result := sign(calculated_result) * round(abs(calculated_result)::numeric / participant_count);'
    );
    changed := true;
  end if;
  if position('nodal_opening_broker_balance' in definition) = 0 then
    definition := replace(
      definition,
      E'  perform set_config(''app.explicit_custom_redistribution'', ''on'', true);\n\n  for current_control in',
      E'  perform set_config(''app.explicit_custom_redistribution'', ''on'', true);\n\n  previous_balance := public.nodal_opening_broker_balance(target_period_id);\n\n  for current_control in'
    );
    changed := true;
  end if;
  if changed then
    execute definition;
  end if;
end;
$$;

select public.recalculate_nodal_account_state(accounts.id) from public.accounts accounts;
