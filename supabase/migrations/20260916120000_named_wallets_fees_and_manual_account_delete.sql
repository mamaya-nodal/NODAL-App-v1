-- Billeteras nombradas, costos de transferencia y eliminacion segura de altas manuales.

create table public.nodal_wallets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint nodal_wallets_name_present check (nullif(btrim(name), '') is not null),
  unique (workspace_id, name)
);

create trigger nodal_wallets_set_updated_at before update on public.nodal_wallets
for each row execute function public.set_updated_at();

alter table public.nodal_wallets enable row level security;
create policy nodal_wallets_read_own on public.nodal_wallets for select to authenticated
using (public.can_access_workspace(workspace_id));
revoke all on table public.nodal_wallets from public, anon;
revoke insert, update, delete on table public.nodal_wallets from authenticated;
grant select on table public.nodal_wallets to authenticated;

insert into public.nodal_wallets(workspace_id, name, created_by)
select spaces.id, 'Billetera principal', spaces.owner_user_id
from public.workspaces spaces
where spaces.modality = 'real'
on conflict (workspace_id, name) do nothing;

drop function if exists public.create_nodal_wallet_movement(uuid,date,public.wallet_movement_kind,bigint,text);
alter table public.wallet_movements alter column kind type text using kind::text;
drop type if exists public.wallet_movement_kind;

alter table public.wallet_movements
  add column wallet_id uuid references public.nodal_wallets(id) on delete restrict,
  add column fee_cents bigint not null default 0,
  add constraint wallet_movements_kind_valid check (kind in (
    'external_contribution', 'personal_withdrawal', 'prior_pending_collection',
    'broker_to_wallet', 'wallet_to_broker'
  )),
  add constraint wallet_movements_fee_valid check (fee_cents >= 0 and fee_cents <= amount_cents);

alter table public.purchases add column wallet_id uuid references public.nodal_wallets(id) on delete restrict;
alter table public.funding_withdrawals
  add column wallet_id uuid references public.nodal_wallets(id) on delete restrict,
  add column collection_fee_cents bigint not null default 0,
  add constraint funding_withdrawals_collection_fee_valid check (
    collection_fee_cents >= 0 and collection_fee_cents <= amount_cents
  );
alter table public.daily_controls
  add column wallet_id uuid references public.nodal_wallets(id) on delete restrict,
  add column transfer_fee_cents bigint not null default 0,
  add constraint daily_controls_transfer_fee_valid check (transfer_fee_cents >= 0);

update public.wallet_movements movements
set wallet_id = wallets.id
from public.periods periods
join public.workspaces spaces on spaces.id = periods.workspace_id
join public.nodal_wallets wallets on wallets.workspace_id = spaces.id and wallets.name = 'Billetera principal'
where movements.period_id = periods.id and movements.wallet_id is null;

update public.purchases purchases
set wallet_id = wallets.id
from public.periods periods
join public.workspaces spaces on spaces.id = periods.workspace_id
join public.nodal_wallets wallets on wallets.workspace_id = spaces.id and wallets.name = 'Billetera principal'
where purchases.period_id = periods.id and purchases.funds_origin = 'Saldo generado' and purchases.wallet_id is null;

update public.funding_withdrawals withdrawals
set wallet_id = wallets.id
from public.periods periods
join public.workspaces spaces on spaces.id = periods.workspace_id
join public.nodal_wallets wallets on wallets.workspace_id = spaces.id and wallets.name = 'Billetera principal'
where withdrawals.period_id = periods.id and withdrawals.wallet_id is null;

update public.daily_controls controls
set wallet_id = wallets.id
from public.periods periods
join public.workspaces spaces on spaces.id = periods.workspace_id
join public.nodal_wallets wallets on wallets.workspace_id = spaces.id and wallets.name = 'Billetera principal'
where controls.period_id = periods.id and controls.origin_destination = 'Saldo billetera' and controls.wallet_id is null;

alter table public.wallet_movements alter column wallet_id set not null;

create or replace function public.calculate_nodal_wallet_balance(target_wallet_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select
    coalesce((select sum(case movements.kind
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

revoke all on function public.calculate_nodal_wallet_balance(uuid) from public, anon;
grant execute on function public.calculate_nodal_wallet_balance(uuid) to authenticated;

create function public.create_nodal_wallet(
  target_period_id uuid,
  target_name text,
  target_opening_balance_cents bigint,
  target_opened_on date
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); selected_workspace uuid; selected_month date; new_id uuid;
begin
  if actor_id is null or nullif(btrim(target_name), '') is null or target_opened_on is null
    or target_opening_balance_cents is null or target_opening_balance_cents < 0 then raise exception 'Invalid wallet'; end if;
  select periods.workspace_id, periods.period_month into selected_workspace, selected_month
  from public.periods periods join public.workspaces spaces on spaces.id = periods.workspace_id
  where periods.id = target_period_id and spaces.owner_user_id = actor_id and spaces.modality = 'real';
  if not found or date_trunc('month', target_opened_on)::date <> selected_month then raise exception 'Wallet period is invalid'; end if;
  insert into public.nodal_wallets(workspace_id,name,created_by,updated_by)
  values(selected_workspace,btrim(target_name),actor_id,actor_id) returning id into new_id;
  if target_opening_balance_cents > 0 then
    insert into public.wallet_movements(period_id,wallet_id,occurred_on,kind,amount_cents,fee_cents,observation,created_by,updated_by)
    values(target_period_id,new_id,target_opened_on,'external_contribution',target_opening_balance_cents,0,'Saldo inicial · aporte trader',actor_id,actor_id);
  end if;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(actor_id,'nodal_wallets',new_id,'wallet_created',jsonb_build_object('name',btrim(target_name),'opening_balance_cents',target_opening_balance_cents),'Billetera creada por el usuario');
  return new_id;
end;
$$;

create function public.rename_nodal_wallet(target_wallet_id uuid, target_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); prior_name text;
begin
  if actor_id is null or nullif(btrim(target_name), '') is null then raise exception 'Invalid wallet name'; end if;
  select wallets.name into prior_name from public.nodal_wallets wallets
  join public.workspaces spaces on spaces.id = wallets.workspace_id
  where wallets.id = target_wallet_id and spaces.owner_user_id = actor_id for update of wallets;
  if not found then raise exception 'Wallet is not available'; end if;
  update public.nodal_wallets set name=btrim(target_name),updated_by=actor_id where id=target_wallet_id;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,previous_data,current_data,reason)
  values(actor_id,'nodal_wallets',target_wallet_id,'wallet_renamed',jsonb_build_object('name',prior_name),jsonb_build_object('name',btrim(target_name)),'Billetera renombrada por el usuario');
  return true;
end;
$$;

create function public.create_nodal_wallet_movement(
  target_period_id uuid,
  target_wallet_id uuid,
  target_occurred_on date,
  target_kind text,
  target_amount_cents bigint,
  target_fee_cents bigint,
  target_observation text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); new_id uuid; period_month date;
begin
  if actor_id is null or not public.can_access_period(target_period_id) then raise exception 'selected period is not accessible'; end if;
  select periods.period_month into period_month from public.periods periods
  join public.nodal_wallets wallets on wallets.workspace_id=periods.workspace_id
  where periods.id=target_period_id and wallets.id=target_wallet_id and wallets.is_active
  for update of wallets;
  if not found or date_trunc('month',target_occurred_on)::date<>period_month or target_amount_cents<=0
    or target_kind not in ('external_contribution','personal_withdrawal','broker_to_wallet','wallet_to_broker')
    or target_fee_cents is null or target_fee_cents<0 or target_fee_cents>target_amount_cents
    or (target_kind not in ('broker_to_wallet','wallet_to_broker') and target_fee_cents<>0) then
    raise exception 'wallet movement is invalid for this period';
  end if;
  if target_kind in ('personal_withdrawal','wallet_to_broker') and public.calculate_nodal_wallet_balance(target_wallet_id)<target_amount_cents then
    raise exception 'wallet balance is insufficient';
  end if;
  insert into public.wallet_movements(period_id,wallet_id,occurred_on,kind,amount_cents,fee_cents,observation,created_by,updated_by)
  values(target_period_id,target_wallet_id,target_occurred_on,target_kind,target_amount_cents,target_fee_cents,nullif(btrim(target_observation),''),actor_id,actor_id)
  returning id into new_id;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(actor_id,'wallet_movements',new_id,'wallet_movement_created',jsonb_build_object('period_id',target_period_id,'wallet_id',target_wallet_id,'kind',target_kind,'amount_cents',target_amount_cents,'fee_cents',target_fee_cents,'occurred_on',target_occurred_on),'Movimiento de billetera informado');
  return new_id;
end;
$$;

create function public.collect_nodal_funding_withdrawal_to_wallet(
  target_period_id uuid,
  target_withdrawal_id uuid,
  target_collected_on date,
  target_wallet_id uuid,
  target_fee_cents bigint
)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); selected_amount bigint;
begin
  if actor_id is null or not public.can_access_period(target_period_id) then raise exception 'selected period is not accessible'; end if;
  if not exists(select 1 from public.nodal_wallets wallets join public.periods periods on periods.workspace_id=wallets.workspace_id where wallets.id=target_wallet_id and periods.id=target_period_id) then raise exception 'Wallet is not available'; end if;
  select amount_cents into selected_amount from public.funding_withdrawals where id=target_withdrawal_id and period_id=target_period_id and is_active for update;
  if not found or target_fee_cents<0 or target_fee_cents>selected_amount then raise exception 'Payout collection is invalid'; end if;
  update public.funding_withdrawals set collected_on=target_collected_on,wallet_id=target_wallet_id,collection_fee_cents=target_fee_cents,updated_by=actor_id where id=target_withdrawal_id;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(actor_id,'funding_withdrawals',target_withdrawal_id,'funding_withdrawal_collected',jsonb_build_object('collected_on',target_collected_on,'wallet_id',target_wallet_id,'fee_cents',target_fee_cents),'Cobro de payout confirmado');
end;
$$;

create function public.assign_nodal_purchase_wallet(target_purchase_id uuid, target_wallet_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); selected_price bigint; selected_period uuid;
begin
  select purchases.price_cents,purchases.period_id into selected_price,selected_period
  from public.purchases purchases join public.periods periods on periods.id=purchases.period_id
  join public.workspaces spaces on spaces.id=periods.workspace_id
  where purchases.id=target_purchase_id and spaces.owner_user_id=actor_id for update of purchases;
  if not found then raise exception 'Purchase is not available'; end if;
  perform 1 from public.nodal_wallets wallets join public.periods periods on periods.workspace_id=wallets.workspace_id
  where wallets.id=target_wallet_id and periods.id=selected_period and wallets.is_active for update of wallets;
  if not found then raise exception 'Wallet is not available'; end if;
  if public.calculate_nodal_wallet_balance(target_wallet_id)<selected_price then raise exception 'wallet balance is insufficient'; end if;
  update public.purchases set wallet_id=target_wallet_id,updated_by=actor_id where id=target_purchase_id;
  return true;
end;
$$;

create function public.create_nodal_purchase_with_wallet(
  target_period_id uuid,target_company_id uuid,target_price_cents bigint,
  target_funds_origin public.purchase_funds_origin,target_wallet_id uuid default null
)
returns table(purchase_id uuid,account_id uuid,purchase_number integer,reference_number integer,purchased_on date)
language plpgsql security definer set search_path='' as $$
declare created record;
begin
  select * into created from public.create_nodal_purchase(target_period_id,target_company_id,target_price_cents,target_funds_origin);
  if target_funds_origin='Saldo generado' then
    if target_wallet_id is null then raise exception 'Wallet is required'; end if;
    perform public.assign_nodal_purchase_wallet(created.purchase_id,target_wallet_id);
  elsif target_wallet_id is not null then raise exception 'Wallet is only valid for generated funds'; end if;
  return query select created.purchase_id,created.account_id,created.purchase_number,created.reference_number,created.purchased_on;
end;
$$;

create function public.create_nodal_detected_purchase_with_wallet(
  target_period_id uuid,target_company_id uuid,target_price_cents bigint,
  target_funds_origin public.purchase_funds_origin,target_purchased_on date,target_connector_id uuid,
  target_connection_name text,target_external_account_name text,target_first_seen_at timestamptz,
  target_wallet_id uuid default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare created_id uuid;
begin
  created_id:=public.create_nodal_detected_purchase(target_period_id,target_company_id,target_price_cents,target_funds_origin,target_purchased_on,target_connector_id,target_connection_name,target_external_account_name,target_first_seen_at);
  if target_funds_origin='Saldo generado' then
    if target_wallet_id is null then raise exception 'Wallet is required'; end if;
    perform public.assign_nodal_purchase_wallet(created_id,target_wallet_id);
  elsif target_wallet_id is not null then raise exception 'Wallet is only valid for generated funds'; end if;
  return created_id;
end;
$$;

create function public.delete_nodal_manual_account(target_account_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor_id uuid := (select auth.uid()); selected public.accounts%rowtype; purchase_id uuid;
begin
  select accounts.* into selected from public.accounts accounts
  join public.periods periods on periods.id=accounts.period_id join public.workspaces spaces on spaces.id=periods.workspace_id
  where accounts.id=target_account_id and spaces.owner_user_id=actor_id for update of accounts;
  if not found then raise exception 'Account is not available'; end if;
  if selected.state<>'virgin' or exists(select 1 from public.ninja_account_links where account_id=target_account_id)
    or exists(select 1 from public.operation_entries where account_id=target_account_id)
    or exists(select 1 from public.manual_account_balance_observations where account_id=target_account_id)
    or exists(select 1 from public.funding_withdrawals where account_id=target_account_id)
    or exists(select 1 from public.ninja_operation_batch_members where account_id=target_account_id) then
    raise exception 'Only unused manual accounts can be deleted';
  end if;
  select id into purchase_id from public.purchases where account_id=target_account_id;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,previous_data,reason)
  values(actor_id,'accounts',target_account_id,'manual_account_deleted',to_jsonb(selected),'Alta manual eliminada antes de tener actividad');
  delete from public.purchases where account_id=target_account_id;
  delete from public.accounts where id=target_account_id;
  return true;
end;
$$;

revoke all on function public.create_nodal_wallet(uuid,text,bigint,date) from public,anon;
revoke all on function public.rename_nodal_wallet(uuid,text) from public,anon;
revoke all on function public.create_nodal_wallet_movement(uuid,uuid,date,text,bigint,bigint,text) from public,anon;
revoke all on function public.collect_nodal_funding_withdrawal_to_wallet(uuid,uuid,date,uuid,bigint) from public,anon;
revoke all on function public.assign_nodal_purchase_wallet(uuid,uuid) from public,anon;
revoke all on function public.create_nodal_purchase_with_wallet(uuid,uuid,bigint,public.purchase_funds_origin,uuid) from public,anon;
revoke all on function public.create_nodal_detected_purchase_with_wallet(uuid,uuid,bigint,public.purchase_funds_origin,date,uuid,text,text,timestamptz,uuid) from public,anon;
revoke all on function public.delete_nodal_manual_account(uuid) from public,anon;
grant execute on function public.create_nodal_wallet(uuid,text,bigint,date) to authenticated;
grant execute on function public.rename_nodal_wallet(uuid,text) to authenticated;
grant execute on function public.create_nodal_wallet_movement(uuid,uuid,date,text,bigint,bigint,text) to authenticated;
grant execute on function public.collect_nodal_funding_withdrawal_to_wallet(uuid,uuid,date,uuid,bigint) to authenticated;
grant execute on function public.create_nodal_purchase_with_wallet(uuid,uuid,bigint,public.purchase_funds_origin,uuid) to authenticated;
grant execute on function public.create_nodal_detected_purchase_with_wallet(uuid,uuid,bigint,public.purchase_funds_origin,date,uuid,text,text,timestamptz,uuid) to authenticated;
grant execute on function public.delete_nodal_manual_account(uuid) to authenticated;
