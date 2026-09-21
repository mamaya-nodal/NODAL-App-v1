-- Apertura conciliada: el resultado previo se infiere y las billeteras se conservan por nombre.

create table public.period_opening_wallets (
  id uuid primary key default gen_random_uuid(),
  opening_snapshot_id uuid not null references public.period_opening_snapshots(id) on delete restrict,
  wallet_id uuid not null references public.nodal_wallets(id) on delete restrict,
  balance_cents bigint not null check (balance_cents >= 0),
  created_at timestamptz not null default now(),
  unique (opening_snapshot_id, wallet_id)
);

create index period_opening_wallets_snapshot_idx
on public.period_opening_wallets(opening_snapshot_id);

alter table public.period_opening_wallets enable row level security;
create policy period_opening_wallets_read_own
on public.period_opening_wallets for select to authenticated
using (exists (
  select 1 from public.period_opening_snapshots snapshots
  where snapshots.id = opening_snapshot_id
    and public.can_access_period(snapshots.period_id)
));
revoke all on table public.period_opening_wallets from public, anon;
revoke insert, update, delete on table public.period_opening_wallets from authenticated;
grant select on table public.period_opening_wallets to authenticated;

-- Conserva los saldos agregados de aperturas creadas con la versión anterior.
insert into public.period_opening_wallets(opening_snapshot_id, wallet_id, balance_cents)
select snapshots.id, wallets.id, snapshots.wallet_balance_cents
from public.period_opening_snapshots snapshots
join public.periods periods on periods.id = snapshots.period_id
join public.nodal_wallets wallets
  on wallets.workspace_id = periods.workspace_id
 and wallets.name = 'Billetera principal'
where snapshots.wallet_balance_cents > 0
on conflict (opening_snapshot_id, wallet_id) do nothing;

-- Las aperturas ya guardadas también quedan conciliadas sin pedir un resultado manual.
update public.period_opening_snapshots snapshots
set prior_realized_result_cents =
  coalesce(snapshots.broker_balance_cents, 0)
  + snapshots.wallet_balance_cents
  + snapshots.funding_pending_cents
  - case
      when snapshots.start_mode = 'zero'
        then snapshots.contributed_capital_cents + snapshots.wallet_balance_cents
      else snapshots.contributed_capital_cents - snapshots.personal_withdrawals_cents
    end;

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
      else 0 end)
      from public.wallet_movements movements where movements.wallet_id = target_wallet_id), 0)
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

drop function public.confirm_nodal_period_opening(
  uuid,text,date,bigint,bigint,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,jsonb
);

create function public.confirm_nodal_period_opening(
  target_period_id uuid,
  target_start_mode text,
  target_cutover_date date,
  target_broker_balance_cents bigint,
  target_funding_pending_cents bigint,
  target_contributed_capital_cents bigint,
  target_personal_withdrawals_cents bigint,
  target_floating_cents bigint,
  target_virgin_accounts integer,
  target_live_evaluation_accounts integer,
  target_funded_accounts integer,
  target_closed_accounts_reference integer,
  target_batches jsonb default '[]'::jsonb,
  target_wallets jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_month date;
  selected_workspace_id uuid;
  snapshot_id uuid;
  batch jsonb;
  wallet jsonb;
  wallet_id uuid;
  wallet_total bigint := 0;
  stored_contributed bigint;
  inferred_result bigint;
begin
  if actor_id is null or not public.can_access_period(target_period_id) then
    raise exception 'selected period is not accessible';
  end if;

  select periods.period_month, periods.workspace_id into selected_month, selected_workspace_id
  from public.periods periods
  join public.workspaces spaces on spaces.id = periods.workspace_id
  where periods.id = target_period_id
    and spaces.owner_user_id = actor_id
    and spaces.modality = 'real';

  if not found then raise exception 'opening is only available for the real workspace'; end if;
  if target_start_mode not in ('zero', 'reconstruct')
    or target_cutover_date is null
    or date_trunc('month', target_cutover_date)::date <> selected_month then
    raise exception 'opening date or mode is invalid';
  end if;
  if target_broker_balance_cents is null or target_broker_balance_cents < 0
    or target_funding_pending_cents < 0 or target_contributed_capital_cents < 0
    or target_personal_withdrawals_cents < 0 or target_floating_cents < 0
    or target_virgin_accounts < 0 or target_live_evaluation_accounts < 0
    or target_funded_accounts < 0 or target_closed_accounts_reference < 0 then
    raise exception 'opening values are invalid';
  end if;
  if target_batches is null or jsonb_typeof(target_batches) <> 'array'
    or target_wallets is null or jsonb_typeof(target_wallets) <> 'array' then
    raise exception 'opening collections are invalid';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(target_wallets) wallet_value
    group by lower(btrim(wallet_value ->> 'name'))
    having count(*) > 1
  ) then raise exception 'wallet names must be unique'; end if;

  for wallet in select value from jsonb_array_elements(target_wallets)
  loop
    if nullif(btrim(wallet ->> 'name'), '') is null
      or coalesce((wallet ->> 'balanceInCents')::bigint, -1) < 0 then
      raise exception 'opening wallet is invalid';
    end if;
    wallet_total := wallet_total + (wallet ->> 'balanceInCents')::bigint;
  end loop;

  if exists(select 1 from public.period_opening_snapshots where period_id = target_period_id) then
    raise exception 'opening was already confirmed';
  end if;
  if exists(select 1 from public.accounts where period_id = target_period_id)
    or exists(select 1 from public.daily_controls where period_id = target_period_id)
    or exists(select 1 from public.operation_entries where period_id = target_period_id)
    or exists(select 1 from public.wallet_movements where period_id = target_period_id)
    or exists(select 1 from public.funding_withdrawals where period_id = target_period_id) then
    raise exception 'opening cannot be confirmed after period activity exists';
  end if;

  stored_contributed := case when target_start_mode = 'zero'
    then target_broker_balance_cents
    else target_contributed_capital_cents end;
  inferred_result := target_broker_balance_cents + wallet_total + target_funding_pending_cents
    - case when target_start_mode = 'zero'
        then stored_contributed + wallet_total
        else stored_contributed - target_personal_withdrawals_cents
      end;

  insert into public.period_opening_snapshots(
    period_id, start_mode, cutover_date, broker_balance_cents, wallet_balance_cents,
    funding_pending_cents, contributed_capital_cents, personal_withdrawals_cents,
    prior_realized_result_cents, floating_cents, virgin_accounts,
    live_evaluation_accounts, funded_accounts, closed_accounts_reference, created_by
  ) values (
    target_period_id, target_start_mode, target_cutover_date, target_broker_balance_cents,
    wallet_total, target_funding_pending_cents, stored_contributed,
    target_personal_withdrawals_cents, inferred_result, target_floating_cents,
    target_virgin_accounts, target_live_evaluation_accounts, target_funded_accounts,
    target_closed_accounts_reference, actor_id
  ) returning id into snapshot_id;

  for wallet in select value from jsonb_array_elements(target_wallets)
  loop
    insert into public.nodal_wallets(workspace_id, name, created_by, updated_by)
    values(selected_workspace_id, btrim(wallet ->> 'name'), actor_id, actor_id)
    on conflict (workspace_id, name) do update set is_active = true, updated_by = actor_id, updated_at = now()
    returning id into wallet_id;
    insert into public.period_opening_wallets(opening_snapshot_id, wallet_id, balance_cents)
    values(snapshot_id, wallet_id, (wallet ->> 'balanceInCents')::bigint);
  end loop;

  for batch in select value from jsonb_array_elements(target_batches)
  loop
    insert into public.period_opening_account_batches(
      opening_snapshot_id, company_name, account_size_cents, stage, account_count,
      cost_per_account_cents, current_cash_value_cents
    ) values (
      snapshot_id, btrim(batch ->> 'companyName'),
      (batch ->> 'accountSizeInCents')::bigint, batch ->> 'stage',
      (batch ->> 'accountCount')::integer,
      coalesce((batch ->> 'costPerAccountInCents')::bigint, 0),
      nullif(batch ->> 'currentCashValueInCents', '')::bigint
    );
  end loop;

  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values(actor_id, 'period_opening_snapshots', snapshot_id, 'period_opening_confirmed',
    (select to_jsonb(opening) from public.period_opening_snapshots opening where opening.id = snapshot_id)
      || jsonb_build_object('batches', target_batches, 'wallets', target_wallets),
    'Punto de partida conciliado y confirmado por el usuario');
  return snapshot_id;
end;
$$;

revoke all on function public.confirm_nodal_period_opening(
  uuid,text,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,jsonb,jsonb
) from public, anon;
grant execute on function public.confirm_nodal_period_opening(
  uuid,text,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,jsonb,jsonb
) to authenticated;
