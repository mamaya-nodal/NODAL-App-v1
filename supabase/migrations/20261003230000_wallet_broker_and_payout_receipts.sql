-- Circuito contable confirmado para payouts y transferencias billetera/broker.
-- 1. El payout aprobado queda como derecho pendiente y avanza la vuelta.
-- 2. El flotante de la cuenta y la billetera cambian recien al confirmar el cobro.
-- 3. Una diferencia broker sin operacion Ninja se concilia como traslado interno,
--    con el fee como unico efecto sobre el resultado.

alter table public.wallet_movements
  add column if not exists daily_control_id uuid references public.daily_controls(id) on delete restrict;

create unique index if not exists wallet_movements_daily_control_unique
on public.wallet_movements(daily_control_id)
where daily_control_id is not null;

alter table public.funding_withdrawals
  add column if not exists collected_period_id uuid references public.periods(id) on delete restrict,
  add column if not exists account_result_applied_period_id uuid references public.periods(id) on delete restrict,
  add column if not exists receipt_timing_v2 boolean not null default false;

-- El backfill alcanza tambien periodos ya cerrados; el control especializado se
-- reinstala debajo antes de exponer cualquier funcion nueva.
drop trigger if exists funding_withdrawals_require_open_period on public.funding_withdrawals;

update public.funding_withdrawals
set collected_period_id = period_id
where collected_on is not null and collected_period_id is null;

-- Los payouts preexistentes ya habian sido aplicados a TOTAL RETIRO al aprobarse.
update public.funding_withdrawals
set account_result_applied_period_id = period_id
where account_result_applied_period_id is null;

alter table public.funding_withdrawals alter column receipt_timing_v2 set default true;

alter table public.funding_withdrawals
  drop constraint if exists funding_withdrawals_collection_period_valid,
  add constraint funding_withdrawals_collection_period_valid check (
    (collected_on is null and collected_period_id is null)
    or (collected_on is not null and collected_period_id is not null)
  );

create index if not exists funding_withdrawals_collected_period_idx
on public.funding_withdrawals(collected_period_id, collected_on)
where collected_period_id is not null;

-- Permite cobrar en el periodo abierto un payout aprobado en un periodo anterior
-- sin habilitar ninguna otra mutacion sobre el periodo cerrado de origen.
create or replace function public.enforce_funding_withdrawal_period()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.period_id = new.period_id
    and old.account_id = new.account_id
    and old.approved_on = new.approved_on
    and old.amount_cents = new.amount_cents
    and old.phase is not distinct from new.phase
    and old.is_active = new.is_active
    and old.created_by = new.created_by
    and old.created_at = new.created_at
    and old.collected_on is null
    and new.collected_on is not null
    and new.collected_period_id is not null
    and exists (
      select 1 from public.periods periods
      where periods.id = new.collected_period_id and periods.lifecycle_status = 'open'
    )
  then
    return new;
  end if;

  if not exists (
    select 1 from public.periods periods
    where periods.id = case when tg_op = 'DELETE' then old.period_id else new.period_id end
      and periods.lifecycle_status = 'open'
  ) then raise exception 'ACCOUNTING_PERIOD_CLOSED'; end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists funding_withdrawals_require_open_period on public.funding_withdrawals;
create trigger funding_withdrawals_require_open_period
before insert or update or delete on public.funding_withdrawals
for each row execute function public.enforce_funding_withdrawal_period();

create or replace function public.calculate_nodal_wallet_balance(target_wallet_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select
    coalesce((select sum(opening.balance_cents)
      from public.period_opening_wallets opening
      where opening.wallet_id = target_wallet_id), 0)
    + coalesce((select sum(case movements.kind
      when 'external_contribution' then movements.amount_cents
      when 'prior_pending_collection' then movements.amount_cents
      when 'broker_to_wallet' then movements.amount_cents - movements.fee_cents
      when 'personal_withdrawal' then -movements.amount_cents
      when 'wallet_to_broker' then -movements.amount_cents
      when 'wallet_to_wallet' then -movements.amount_cents
      else 0 end)
      from public.wallet_movements movements
      where movements.wallet_id = target_wallet_id
        and movements.daily_control_id is null), 0)
    + coalesce((select sum(movements.amount_cents - movements.fee_cents)
      from public.wallet_movements movements
      where movements.kind = 'wallet_to_wallet'
        and movements.destination_wallet_id = target_wallet_id), 0)
    + coalesce((select sum(withdrawals.amount_cents - withdrawals.collection_fee_cents)
      from public.funding_withdrawals withdrawals
      where withdrawals.wallet_id = target_wallet_id
        and withdrawals.collected_on is not null
        and withdrawals.is_active), 0)
    - coalesce((select sum(purchases.price_cents)
      from public.purchases purchases where purchases.wallet_id = target_wallet_id), 0)
    + coalesce((select sum(case controls.kind
      when 'withdrawal' then controls.movement_cents - controls.transfer_fee_cents
      when 'deposit' then -(controls.movement_cents + controls.transfer_fee_cents)
      else 0 end)
      from public.daily_controls controls
      where controls.wallet_id = target_wallet_id
        and controls.origin_destination = 'Saldo billetera'), 0)
  from public.nodal_wallets target
  where target.id = target_wallet_id
    and public.can_access_workspace(target.workspace_id);
$$;

create or replace function public.create_nodal_wallet_movement(
  target_period_id uuid,
  target_wallet_id uuid,
  target_occurred_on date,
  target_kind text,
  target_amount_cents bigint,
  target_fee_cents bigint,
  target_observation text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); new_id uuid; selected_workspace uuid;
begin
  if actor_id is null or not public.can_access_period(target_period_id) then
    raise exception 'selected period is not accessible';
  end if;
  select periods.workspace_id into selected_workspace
  from public.periods periods
  where periods.id = target_period_id and periods.lifecycle_status = 'open'
  for update;
  if not found
    or not public.nodal_date_belongs_to_period(target_period_id, target_occurred_on)
    or target_amount_cents is null or target_amount_cents <= 0
    or target_kind not in ('external_contribution','personal_withdrawal')
    or target_fee_cents is null or target_fee_cents <> 0 then
    raise exception 'wallet movement is invalid for this period';
  end if;
  perform 1 from public.nodal_wallets wallets
  where wallets.id = target_wallet_id and wallets.workspace_id = selected_workspace and wallets.is_active
  for update;
  if not found then raise exception 'Wallet is not available'; end if;
  if target_kind = 'personal_withdrawal'
    and public.calculate_nodal_wallet_balance(target_wallet_id) < target_amount_cents then
    raise exception 'wallet balance is insufficient';
  end if;
  insert into public.wallet_movements(
    period_id,wallet_id,occurred_on,kind,amount_cents,fee_cents,observation,created_by,updated_by
  ) values (
    target_period_id,target_wallet_id,target_occurred_on,target_kind,target_amount_cents,0,
    nullif(btrim(target_observation),''),actor_id,actor_id
  ) returning id into new_id;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(actor_id,'wallet_movements',new_id,'wallet_movement_created',jsonb_build_object(
    'period_id',target_period_id,'wallet_id',target_wallet_id,'kind',target_kind,
    'amount_cents',target_amount_cents,'occurred_on',target_occurred_on
  ),'Movimiento externo de billetera informado');
  return new_id;
end;
$$;

create or replace function public.reconcile_nodal_wallet_broker_transfer(
  target_period_id uuid,
  target_wallet_id uuid,
  target_occurred_on date,
  target_kind text,
  target_observed_broker_balance_cents bigint,
  target_fee_cents bigint default 0,
  target_observation text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  selected_workspace uuid;
  prior_balance bigint;
  transfer_amount bigint;
  control_kind public.daily_control_kind;
  created_control_id uuid;
  created_movement_id uuid;
begin
  if actor_id is null or target_observed_broker_balance_cents is null
    or target_observed_broker_balance_cents < 0
    or target_fee_cents is null or target_fee_cents < 0
    or target_kind not in ('wallet_to_broker','broker_to_wallet') then
    raise exception 'BROKER_TRANSFER_INVALID';
  end if;

  select periods.workspace_id into selected_workspace
  from public.periods periods
  where periods.id = target_period_id
    and periods.lifecycle_status = 'open'
    and public.can_access_period(periods.id)
  for update;
  if not found or not public.nodal_date_belongs_to_period(target_period_id, target_occurred_on) then
    raise exception 'BROKER_TRANSFER_PERIOD_INVALID';
  end if;

  perform 1 from public.nodal_wallets wallets
  where wallets.id = target_wallet_id and wallets.workspace_id = selected_workspace and wallets.is_active
  for update;
  if not found then raise exception 'BROKER_TRANSFER_WALLET_INVALID'; end if;

  select controls.balance_after_cents into prior_balance
  from public.daily_controls controls
  join public.periods periods on periods.id = controls.period_id
  where periods.workspace_id = selected_workspace
  order by periods.period_month desc, controls.control_number desc
  limit 1;

  if prior_balance is null then
    select snapshots.broker_balance_cents into prior_balance
    from public.period_opening_snapshots snapshots
    join public.periods periods on periods.id = snapshots.period_id
    where periods.workspace_id = selected_workspace
      and periods.period_month <= (select period_month from public.periods where id = target_period_id)
      and snapshots.broker_balance_cents is not null
    order by periods.period_month desc, snapshots.created_at desc
    limit 1;
  end if;
  if prior_balance is null then raise exception 'BROKER_TRANSFER_BASELINE_MISSING'; end if;

  if target_kind = 'wallet_to_broker' then
    transfer_amount := target_observed_broker_balance_cents - prior_balance;
    control_kind := 'deposit';
    if transfer_amount <= 0 then raise exception 'BROKER_TRANSFER_DIRECTION_MISMATCH'; end if;
    if public.calculate_nodal_wallet_balance(target_wallet_id) < transfer_amount + target_fee_cents then
      raise exception 'wallet balance is insufficient';
    end if;
  else
    transfer_amount := prior_balance - target_observed_broker_balance_cents;
    control_kind := 'withdrawal';
    if transfer_amount <= 0 or target_fee_cents > transfer_amount then
      raise exception 'BROKER_TRANSFER_DIRECTION_MISMATCH';
    end if;
  end if;

  select confirmed.daily_control_id into created_control_id
  from public.confirm_nodal_daily_control(
    target_period_id => target_period_id,
    target_kind => control_kind,
    target_operated_on => target_occurred_on,
    target_confirmation_key => gen_random_uuid(),
    target_amount_cents => transfer_amount,
    target_origin_destination => 'Saldo billetera',
    target_observations => nullif(btrim(target_observation),''),
    target_source => 'manual'
  ) confirmed;

  update public.daily_controls
  set wallet_id = target_wallet_id,
      transfer_fee_cents = target_fee_cents,
      updated_by = actor_id
  where id = created_control_id;

  insert into public.wallet_movements(
    period_id,wallet_id,daily_control_id,occurred_on,kind,amount_cents,fee_cents,
    observation,created_by,updated_by
  ) values (
    target_period_id,target_wallet_id,created_control_id,target_occurred_on,target_kind,
    transfer_amount,target_fee_cents,nullif(btrim(target_observation),''),actor_id,actor_id
  ) returning id into created_movement_id;

  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(actor_id,'wallet_movements',created_movement_id,'wallet_broker_transfer_reconciled',jsonb_build_object(
    'period_id',target_period_id,'wallet_id',target_wallet_id,'daily_control_id',created_control_id,
    'kind',target_kind,'broker_balance_before_cents',prior_balance,
    'broker_balance_after_cents',target_observed_broker_balance_cents,
    'amount_cents',transfer_amount,'fee_cents',target_fee_cents,'occurred_on',target_occurred_on
  ),'Diferencia broker sin operacion Ninja conciliada como transferencia interna');
  return created_movement_id;
end;
$$;

create or replace function public.create_nodal_funding_withdrawal(
  target_period_id uuid,
  target_account_id uuid,
  target_approved_on date,
  target_amount_cents bigint
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); new_id uuid; target_phase public.operation_phase;
begin
  if actor_id is null or not public.can_access_period(target_period_id) then
    raise exception 'selected period is not accessible';
  end if;
  if target_amount_cents is null or target_amount_cents <= 0
    or target_approved_on is null
    or not public.nodal_date_belongs_to_period(target_period_id,target_approved_on) then
    raise exception 'funding withdrawal is invalid for this period';
  end if;
  perform 1 from public.periods where id=target_period_id and lifecycle_status='open' for update;
  if not found then raise exception 'ACCOUNTING_PERIOD_CLOSED'; end if;
  perform 1 from public.accounts accounts
  where accounts.id=target_account_id and accounts.state='live'
    and accounts.workspace_id=(select workspace_id from public.periods where id=target_period_id)
  for update;
  if not found then raise exception 'FUNDING_ACCOUNT_NOT_ELIGIBLE'; end if;
  select entries.phase into target_phase
  from public.operation_entries entries
  where entries.account_id=target_account_id and entries.phase<>'Evaluacion'
  order by array_position(array['Evaluacion','Primera vuelta','Segunda vuelta','Tercera vuelta','Cuarta vuelta','Quinta vuelta']::public.operation_phase[],entries.phase) desc,
    entries.operated_on desc,entries.created_at desc limit 1;
  if target_phase is null then raise exception 'FUNDING_ACCOUNT_NOT_ELIGIBLE'; end if;
  if exists(select 1 from public.funding_withdrawals withdrawals
    where withdrawals.account_id=target_account_id and withdrawals.phase=target_phase and withdrawals.is_active)
  then raise exception 'FUNDING_PAYOUT_ALREADY_RECORDED'; end if;
  insert into public.funding_withdrawals(
    period_id,account_id,approved_on,amount_cents,phase,created_by,updated_by
  ) values (
    target_period_id,target_account_id,target_approved_on,target_amount_cents,target_phase,actor_id,actor_id
  ) returning id into new_id;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(actor_id,'funding_withdrawals',new_id,'funding_withdrawal_approved',jsonb_build_object(
    'period_id',target_period_id,'account_id',target_account_id,'amount_cents',target_amount_cents,
    'approved_on',target_approved_on,'phase',target_phase,'status','pending'
  ),'Payout aprobado y pendiente de acreditacion');
  return new_id;
end;
$$;

create or replace function public.collect_nodal_funding_withdrawal_to_wallet(
  target_period_id uuid,
  target_withdrawal_id uuid,
  target_collected_on date,
  target_wallet_id uuid,
  target_fee_cents bigint
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  selected public.funding_withdrawals%rowtype;
  selected_workspace uuid;
  prior_phase_total bigint := 0;
begin
  if actor_id is null or target_collected_on is null or target_fee_cents is null or target_fee_cents < 0 then
    raise exception 'PAYOUT_COLLECTION_INVALID';
  end if;
  select periods.workspace_id into selected_workspace
  from public.periods periods
  where periods.id=target_period_id and periods.lifecycle_status='open'
    and public.can_access_period(periods.id)
  for update;
  if not found or not public.nodal_date_belongs_to_period(target_period_id,target_collected_on) then
    raise exception 'PAYOUT_COLLECTION_PERIOD_INVALID';
  end if;
  select withdrawals.* into selected from public.funding_withdrawals withdrawals
  join public.accounts accounts on accounts.id=withdrawals.account_id
  where withdrawals.id=target_withdrawal_id and withdrawals.is_active
    and accounts.workspace_id=selected_workspace
  for update of withdrawals;
  if not found or selected.collected_on is not null or target_collected_on < selected.approved_on
    or target_fee_cents > selected.amount_cents then
    raise exception 'PAYOUT_COLLECTION_INVALID';
  end if;
  perform 1 from public.nodal_wallets wallets
  where wallets.id=target_wallet_id and wallets.workspace_id=selected_workspace and wallets.is_active
  for update;
  if not found then raise exception 'PAYOUT_COLLECTION_WALLET_INVALID'; end if;

  select coalesce(withdrawals.total_withdrawal_cents,0) into prior_phase_total
  from public.account_phase_withdrawals withdrawals
  where withdrawals.account_id=selected.account_id and withdrawals.phase=selected.phase
  for update;
  prior_phase_total := coalesce(prior_phase_total,0);
  insert into public.account_phase_withdrawals(
    period_id,account_id,phase,total_withdrawal_cents,created_by,updated_by
  ) values (
    target_period_id,selected.account_id,selected.phase,
    prior_phase_total+selected.amount_cents,actor_id,actor_id
  ) on conflict(account_id,phase) do update set
    total_withdrawal_cents=excluded.total_withdrawal_cents,
    period_id=excluded.period_id,
    updated_by=actor_id;

  update public.funding_withdrawals set
    collected_on=target_collected_on,
    collected_period_id=target_period_id,
    account_result_applied_period_id=target_period_id,
    wallet_id=target_wallet_id,
    collection_fee_cents=target_fee_cents,
    updated_by=actor_id
  where id=target_withdrawal_id;

  perform public.recalculate_nodal_account_state(selected.account_id);
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(actor_id,'funding_withdrawals',target_withdrawal_id,'funding_withdrawal_collected',jsonb_build_object(
    'approved_period_id',selected.period_id,'collected_period_id',target_period_id,
    'collected_on',target_collected_on,'wallet_id',target_wallet_id,
    'amount_cents',selected.amount_cents,'fee_cents',target_fee_cents,
    'account_result_applied',true
  ),'Cobro de payout confirmado, acreditado en billetera y aplicado al flotante');
end;
$$;

revoke all on function public.reconcile_nodal_wallet_broker_transfer(uuid,uuid,date,text,bigint,bigint,text) from public,anon;
grant execute on function public.reconcile_nodal_wallet_broker_transfer(uuid,uuid,date,text,bigint,bigint,text) to authenticated;

comment on function public.reconcile_nodal_wallet_broker_transfer(uuid,uuid,date,text,bigint,bigint,text)
is 'Concilia una diferencia broker sin operacion Ninja como transferencia interna atomica con una billetera.';

comment on function public.create_nodal_funding_withdrawal(uuid,uuid,date,bigint)
is 'Registra un payout aprobado como pendiente; avanza la vuelta sin reducir el flotante de la cuenta.';

comment on function public.collect_nodal_funding_withdrawal_to_wallet(uuid,uuid,date,uuid,bigint)
is 'Confirma el cobro, acredita la billetera y recien entonces aplica el payout al resultado de la cuenta.';
