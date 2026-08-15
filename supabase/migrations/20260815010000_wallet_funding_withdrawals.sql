create type public.wallet_movement_kind as enum (
  'external_contribution', 'personal_withdrawal', 'prior_pending_collection'
);

create table public.wallet_movements (
  id uuid primary key default gen_random_uuid(), period_id uuid not null references public.periods(id) on delete restrict,
  occurred_on date not null, kind public.wallet_movement_kind not null, amount_cents bigint not null,
  observation text, created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint wallet_movements_amount_positive check (amount_cents > 0),
  constraint wallet_movements_observation_present check (observation is null or btrim(observation) <> '')
);

create table public.funding_withdrawals (
  id uuid primary key default gen_random_uuid(), period_id uuid not null references public.periods(id) on delete restrict,
  account_id uuid not null, approved_on date not null, amount_cents bigint not null,
  collected_on date, is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  foreign key (account_id, period_id) references public.accounts(id, period_id) on delete restrict,
  constraint funding_withdrawals_amount_positive check (amount_cents > 0)
);

create index wallet_movements_period_date_idx on public.wallet_movements(period_id, occurred_on);
create index funding_withdrawals_period_date_idx on public.funding_withdrawals(period_id, approved_on);
create trigger wallet_movements_set_updated_at before update on public.wallet_movements for each row execute function public.set_updated_at();
create trigger funding_withdrawals_set_updated_at before update on public.funding_withdrawals for each row execute function public.set_updated_at();
alter table public.wallet_movements enable row level security;
alter table public.funding_withdrawals enable row level security;
create policy wallet_movements_read_own on public.wallet_movements for select to authenticated using (public.can_access_period(period_id));
create policy funding_withdrawals_read_own on public.funding_withdrawals for select to authenticated using (public.can_access_period(period_id));
revoke all on table public.wallet_movements, public.funding_withdrawals from anon;
revoke insert, update, delete on table public.wallet_movements, public.funding_withdrawals from authenticated;
grant select on table public.wallet_movements, public.funding_withdrawals to authenticated;

create function public.create_nodal_wallet_movement(target_period_id uuid, target_occurred_on date, target_kind public.wallet_movement_kind, target_amount_cents bigint, target_observation text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); new_id uuid; period_month date;
begin
  if actor_id is null or not public.can_access_period(target_period_id) then raise exception 'selected period is not accessible'; end if;
  select periods.period_month into period_month from public.periods as periods where periods.id = target_period_id;
  if date_trunc('month', target_occurred_on)::date <> period_month or target_amount_cents <= 0 then raise exception 'wallet movement is invalid for this period'; end if;
  insert into public.wallet_movements(period_id, occurred_on, kind, amount_cents, observation, created_by, updated_by)
  values(target_period_id, target_occurred_on, target_kind, target_amount_cents, nullif(btrim(target_observation), ''), actor_id, actor_id) returning id into new_id;
  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values(actor_id, 'wallet_movements', new_id, 'wallet_movement_created', jsonb_build_object('period_id',target_period_id,'kind',target_kind,'amount_cents',target_amount_cents,'occurred_on',target_occurred_on), 'Movimiento de billetera informado');
  return new_id;
end;
$$;

create function public.create_nodal_funding_withdrawal(target_period_id uuid, target_account_id uuid, target_approved_on date, target_amount_cents bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); new_id uuid; period_month date;
begin
  if actor_id is null or not public.can_access_period(target_period_id) then raise exception 'selected period is not accessible'; end if;
  select periods.period_month into period_month from public.periods as periods where periods.id = target_period_id;
  if date_trunc('month', target_approved_on)::date <> period_month or target_amount_cents <= 0 or not exists(select 1 from public.accounts where id=target_account_id and period_id=target_period_id) then raise exception 'funding withdrawal is invalid for this period'; end if;
  insert into public.funding_withdrawals(period_id, account_id, approved_on, amount_cents, created_by, updated_by)
  values(target_period_id,target_account_id,target_approved_on,target_amount_cents,actor_id,actor_id) returning id into new_id;
  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values(actor_id,'funding_withdrawals',new_id,'funding_withdrawal_approved',jsonb_build_object('period_id',target_period_id,'account_id',target_account_id,'amount_cents',target_amount_cents,'approved_on',target_approved_on),'Retiro de fondeo aprobado');
  return new_id;
end;
$$;

create function public.collect_nodal_funding_withdrawal(target_period_id uuid, target_withdrawal_id uuid, target_collected_on date)
returns void language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not public.can_access_period(target_period_id) then raise exception 'selected period is not accessible'; end if;
  update public.funding_withdrawals set collected_on=target_collected_on, updated_by=actor_id where id=target_withdrawal_id and period_id=target_period_id and is_active;
  if not found then raise exception 'funding withdrawal is not available'; end if;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(actor_id,'funding_withdrawals',target_withdrawal_id,'funding_withdrawal_collected',jsonb_build_object('collected_on',target_collected_on),'Cobro de fondeo confirmado');
end;
$$;

revoke all on function public.create_nodal_wallet_movement(uuid,date,public.wallet_movement_kind,bigint,text) from public,anon;
revoke all on function public.create_nodal_funding_withdrawal(uuid,uuid,date,bigint) from public,anon;
revoke all on function public.collect_nodal_funding_withdrawal(uuid,uuid,date) from public,anon;
grant execute on function public.create_nodal_wallet_movement(uuid,date,public.wallet_movement_kind,bigint,text) to authenticated;
grant execute on function public.create_nodal_funding_withdrawal(uuid,uuid,date,bigint) to authenticated;
grant execute on function public.collect_nodal_funding_withdrawal(uuid,uuid,date) to authenticated;
