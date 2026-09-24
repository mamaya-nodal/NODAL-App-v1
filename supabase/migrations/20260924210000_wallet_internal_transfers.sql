-- Transferencias atómicas entre billeteras del mismo workspace.

alter table public.wallet_movements
  add column destination_wallet_id uuid references public.nodal_wallets(id) on delete restrict;

alter table public.wallet_movements
  drop constraint wallet_movements_kind_valid,
  add constraint wallet_movements_kind_valid check (kind in (
    'external_contribution', 'personal_withdrawal', 'prior_pending_collection',
    'broker_to_wallet', 'wallet_to_broker', 'wallet_to_wallet'
  )),
  add constraint wallet_movements_destination_valid check (
    (kind = 'wallet_to_wallet'
      and destination_wallet_id is not null
      and destination_wallet_id <> wallet_id
      and fee_cents < amount_cents)
    or (kind <> 'wallet_to_wallet' and destination_wallet_id is null)
  );

create index wallet_movements_destination_wallet_id_idx
on public.wallet_movements(destination_wallet_id)
where destination_wallet_id is not null;

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
      from public.wallet_movements movements where movements.wallet_id = target_wallet_id), 0)
    + coalesce((select sum(movements.amount_cents - movements.fee_cents)
      from public.wallet_movements movements
      where movements.kind = 'wallet_to_wallet'
        and movements.destination_wallet_id = target_wallet_id), 0)
    + coalesce((select sum(withdrawals.amount_cents - withdrawals.collection_fee_cents)
      from public.funding_withdrawals withdrawals
      where withdrawals.wallet_id = target_wallet_id and withdrawals.collected_on is not null and withdrawals.is_active), 0)
    - coalesce((select sum(purchases.price_cents)
      from public.purchases purchases where purchases.wallet_id = target_wallet_id), 0)
    + coalesce((select sum(case controls.kind
      when 'withdrawal' then controls.movement_cents - controls.transfer_fee_cents
      when 'deposit' then -(controls.movement_cents + controls.transfer_fee_cents)
      else 0 end)
      from public.daily_controls controls
      where controls.wallet_id = target_wallet_id and controls.origin_destination = 'Saldo billetera'), 0)
  from public.nodal_wallets target
  where target.id = target_wallet_id
    and public.can_access_workspace(target.workspace_id);
$$;

create function public.create_nodal_wallet_transfer(
  target_period_id uuid,
  target_source_wallet_id uuid,
  target_destination_wallet_id uuid,
  target_occurred_on date,
  target_amount_cents bigint,
  target_fee_cents bigint,
  target_observation text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  new_id uuid;
  selected_month date;
  selected_workspace_id uuid;
begin
  if actor_id is null
    or target_source_wallet_id is null
    or target_destination_wallet_id is null
    or target_source_wallet_id = target_destination_wallet_id
    or target_occurred_on is null
    or target_amount_cents is null
    or target_amount_cents <= 0
    or target_fee_cents is null
    or target_fee_cents < 0
    or target_fee_cents >= target_amount_cents then
    raise exception 'wallet transfer is invalid';
  end if;

  select periods.workspace_id, periods.period_month
  into selected_workspace_id, selected_month
  from public.periods periods
  where periods.id = target_period_id
    and public.can_access_period(periods.id);
  if not found or date_trunc('month', target_occurred_on)::date <> selected_month then
    raise exception 'wallet transfer period is invalid';
  end if;

  perform 1
  from public.nodal_wallets wallets
  where wallets.id in (target_source_wallet_id, target_destination_wallet_id)
  order by wallets.id
  for update;

  if not exists (
    select 1 from public.nodal_wallets wallets
    where wallets.id = target_source_wallet_id
      and wallets.workspace_id = selected_workspace_id
      and wallets.is_active
  ) or not exists (
    select 1 from public.nodal_wallets wallets
    where wallets.id = target_destination_wallet_id
      and wallets.workspace_id = selected_workspace_id
      and wallets.is_active
  ) then
    raise exception 'wallet transfer wallets are not available';
  end if;

  if public.calculate_nodal_wallet_balance(target_source_wallet_id) < target_amount_cents then
    raise exception 'wallet balance is insufficient';
  end if;

  insert into public.wallet_movements(
    period_id, wallet_id, destination_wallet_id, occurred_on, kind,
    amount_cents, fee_cents, observation, created_by, updated_by
  ) values (
    target_period_id, target_source_wallet_id, target_destination_wallet_id,
    target_occurred_on, 'wallet_to_wallet', target_amount_cents, target_fee_cents,
    nullif(btrim(target_observation), ''), actor_id, actor_id
  ) returning id into new_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id, 'wallet_movements', new_id, 'wallet_transfer_created',
    jsonb_build_object(
      'period_id', target_period_id,
      'source_wallet_id', target_source_wallet_id,
      'destination_wallet_id', target_destination_wallet_id,
      'amount_cents', target_amount_cents,
      'fee_cents', target_fee_cents,
      'occurred_on', target_occurred_on
    ),
    'Transferencia interna entre billeteras informada por el usuario'
  );

  return new_id;
end;
$$;

revoke all on function public.create_nodal_wallet_transfer(
  uuid, uuid, uuid, date, bigint, bigint, text
) from public, anon;
grant execute on function public.create_nodal_wallet_transfer(
  uuid, uuid, uuid, date, bigint, bigint, text
) to authenticated;

comment on function public.create_nodal_wallet_transfer(
  uuid, uuid, uuid, date, bigint, bigint, text
) is 'Registra atómicamente un traslado entre dos billeteras del mismo workspace; sólo el fee altera el total del circuito.';
