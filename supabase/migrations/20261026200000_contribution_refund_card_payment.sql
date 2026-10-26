-- Distingue la devolucion de un aporte / pago de tarjeta de un retiro personal.
-- Ambos reducen la ubicacion de fondos y el capital neto, sin crear resultado.

begin;

alter table public.wallet_movements
  drop constraint if exists wallet_movements_kind_valid,
  add constraint wallet_movements_kind_valid check (kind in (
    'external_contribution', 'personal_withdrawal', 'contribution_refund',
    'prior_pending_collection', 'broker_to_wallet', 'wallet_to_broker',
    'wallet_to_wallet'
  ));

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
      when 'contribution_refund' then -movements.amount_cents
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
    or target_kind not in ('external_contribution','personal_withdrawal','contribution_refund')
    or target_fee_cents is null or target_fee_cents <> 0 then
    raise exception 'wallet movement is invalid for this period';
  end if;
  perform 1 from public.nodal_wallets wallets
  where wallets.id = target_wallet_id and wallets.workspace_id = selected_workspace and wallets.is_active
  for update;
  if not found then raise exception 'Wallet is not available'; end if;
  if target_kind in ('personal_withdrawal','contribution_refund')
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
  ),'Movimiento externo de billetera o cuenta bancaria informado');
  return new_id;
end;
$$;

revoke all on function public.create_nodal_wallet_movement(uuid,uuid,date,text,bigint,bigint,text)
from public, anon;
grant execute on function public.create_nodal_wallet_movement(uuid,uuid,date,text,bigint,bigint,text)
to authenticated;

commit;
