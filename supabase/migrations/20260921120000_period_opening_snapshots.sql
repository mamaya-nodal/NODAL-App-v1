-- Apertura inicial para alumnos que comienzan desde cero o migran un ciclo en curso.
-- Conserva un pantallazo auditable sin inventar operaciones ni cuentas cerradas.

create table public.period_opening_snapshots (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null unique references public.periods(id) on delete restrict,
  start_mode text not null,
  cutover_date date not null,
  broker_balance_cents bigint,
  wallet_balance_cents bigint not null default 0,
  funding_pending_cents bigint not null default 0,
  contributed_capital_cents bigint not null default 0,
  personal_withdrawals_cents bigint not null default 0,
  prior_realized_result_cents bigint not null default 0,
  floating_cents bigint not null default 0,
  virgin_accounts integer not null default 0,
  live_evaluation_accounts integer not null default 0,
  funded_accounts integer not null default 0,
  closed_accounts_reference integer not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint period_opening_start_mode_valid check (start_mode in ('zero', 'reconstruct')),
  constraint period_opening_nonnegative_balances check (
    wallet_balance_cents >= 0 and funding_pending_cents >= 0
    and contributed_capital_cents >= 0 and personal_withdrawals_cents >= 0
  ),
  constraint period_opening_nonnegative_counts check (
    virgin_accounts >= 0 and live_evaluation_accounts >= 0
    and funded_accounts >= 0 and closed_accounts_reference >= 0
  )
);

create table public.period_opening_account_batches (
  id uuid primary key default gen_random_uuid(),
  opening_snapshot_id uuid not null references public.period_opening_snapshots(id) on delete restrict,
  company_name text not null,
  account_size_cents bigint not null,
  stage text not null,
  account_count integer not null,
  cost_per_account_cents bigint not null default 0,
  current_cash_value_cents bigint,
  created_at timestamptz not null default now(),
  constraint opening_batch_company_present check (nullif(btrim(company_name), '') is not null),
  constraint opening_batch_stage_valid check (stage in ('virgin', 'evaluation', 'funded')),
  constraint opening_batch_values_valid check (
    account_size_cents > 0 and account_count > 0 and cost_per_account_cents >= 0
    and (current_cash_value_cents is null or current_cash_value_cents >= 0)
  )
);

create index period_opening_batches_snapshot_idx
on public.period_opening_account_batches(opening_snapshot_id);

alter table public.period_opening_snapshots enable row level security;
alter table public.period_opening_account_batches enable row level security;

create policy period_opening_snapshots_read_own
on public.period_opening_snapshots for select to authenticated
using (public.can_access_period(period_id));

create policy period_opening_batches_read_own
on public.period_opening_account_batches for select to authenticated
using (exists (
  select 1 from public.period_opening_snapshots snapshots
  where snapshots.id = opening_snapshot_id
    and public.can_access_period(snapshots.period_id)
));

revoke all on table public.period_opening_snapshots, public.period_opening_account_batches from public, anon;
revoke insert, update, delete on table public.period_opening_snapshots, public.period_opening_account_batches from authenticated;
grant select on table public.period_opening_snapshots, public.period_opening_account_batches to authenticated;

create function public.confirm_nodal_period_opening(
  target_period_id uuid,
  target_start_mode text,
  target_cutover_date date,
  target_broker_balance_cents bigint,
  target_wallet_balance_cents bigint,
  target_funding_pending_cents bigint,
  target_contributed_capital_cents bigint,
  target_personal_withdrawals_cents bigint,
  target_prior_realized_result_cents bigint,
  target_floating_cents bigint,
  target_virgin_accounts integer,
  target_live_evaluation_accounts integer,
  target_funded_accounts integer,
  target_closed_accounts_reference integer,
  target_batches jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_month date;
  snapshot_id uuid;
  batch jsonb;
begin
  if actor_id is null or not public.can_access_period(target_period_id) then
    raise exception 'selected period is not accessible';
  end if;

  select periods.period_month into selected_month
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
  if target_wallet_balance_cents < 0 or target_funding_pending_cents < 0
    or target_contributed_capital_cents < 0 or target_personal_withdrawals_cents < 0
    or target_virgin_accounts < 0 or target_live_evaluation_accounts < 0
    or target_funded_accounts < 0 or target_closed_accounts_reference < 0 then
    raise exception 'opening values are invalid';
  end if;
  if target_broker_balance_cents is not null and target_broker_balance_cents < 0 then
    raise exception 'broker opening balance is invalid';
  end if;
  if target_batches is null or jsonb_typeof(target_batches) <> 'array' then
    raise exception 'opening batches are invalid';
  end if;

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

  insert into public.period_opening_snapshots(
    period_id, start_mode, cutover_date, broker_balance_cents, wallet_balance_cents,
    funding_pending_cents, contributed_capital_cents, personal_withdrawals_cents,
    prior_realized_result_cents, floating_cents, virgin_accounts,
    live_evaluation_accounts, funded_accounts, closed_accounts_reference, created_by
  ) values (
    target_period_id, target_start_mode, target_cutover_date, target_broker_balance_cents,
    target_wallet_balance_cents, target_funding_pending_cents, target_contributed_capital_cents,
    target_personal_withdrawals_cents, target_prior_realized_result_cents, target_floating_cents,
    target_virgin_accounts, target_live_evaluation_accounts, target_funded_accounts,
    target_closed_accounts_reference, actor_id
  ) returning id into snapshot_id;

  for batch in select value from jsonb_array_elements(target_batches)
  loop
    insert into public.period_opening_account_batches(
      opening_snapshot_id, company_name, account_size_cents, stage, account_count,
      cost_per_account_cents, current_cash_value_cents
    ) values (
      snapshot_id,
      btrim(batch ->> 'companyName'),
      (batch ->> 'accountSizeInCents')::bigint,
      batch ->> 'stage',
      (batch ->> 'accountCount')::integer,
      coalesce((batch ->> 'costPerAccountInCents')::bigint, 0),
      nullif(batch ->> 'currentCashValueInCents', '')::bigint
    );
  end loop;

  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values(
    actor_id,
    'period_opening_snapshots',
    snapshot_id,
    'period_opening_confirmed',
    (
      select to_jsonb(opening_snapshot)
      from public.period_opening_snapshots opening_snapshot
      where opening_snapshot.id = snapshot_id
    ) || jsonb_build_object('batches', target_batches),
    'Punto de partida confirmado por el usuario'
  );

  return snapshot_id;
end;
$$;

revoke all on function public.confirm_nodal_period_opening(
  uuid,text,date,bigint,bigint,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,jsonb
) from public, anon;
grant execute on function public.confirm_nodal_period_opening(
  uuid,text,date,bigint,bigint,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,jsonb
) to authenticated;
