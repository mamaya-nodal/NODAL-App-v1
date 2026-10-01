-- Períodos operativos NODAL, cierres versionados y continuidad de cuentas.
-- Un período se identifica por el mes de su primer lunes, abre operativamente
-- ese lunes y cierra el viernes anterior al primer lunes siguiente a las 19:00
-- de America/Argentina/Buenos_Aires.

create or replace function public.nodal_first_monday(target_month date)
returns date
language sql
immutable
set search_path = ''
as $$
  select (
    date_trunc('month', target_month)::date
    + ((8 - extract(isodow from date_trunc('month', target_month)::date)::integer) % 7)
  )::date;
$$;

create or replace function public.nodal_period_close_at(target_month date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (
    public.nodal_first_monday((date_trunc('month', target_month) + interval '1 month')::date)
    - 3
    + time '19:00'
  ) at time zone 'America/Argentina/Buenos_Aires';
$$;

create or replace function public.nodal_accounting_period_month(reference_at timestamptz default now())
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  local_date date := (reference_at at time zone 'America/Argentina/Buenos_Aires')::date;
  local_time time := (reference_at at time zone 'America/Argentina/Buenos_Aires')::time;
  calendar_month date := date_trunc('month', local_date)::date;
  current_cutover date := public.nodal_first_monday(calendar_month) - 3;
  next_cutover date := public.nodal_first_monday((calendar_month + interval '1 month')::date) - 3;
begin
  if local_date < current_cutover or (local_date = current_cutover and local_time < time '19:00') then
    return (calendar_month - interval '1 month')::date;
  end if;
  if local_date > next_cutover or (local_date = next_cutover and local_time >= time '19:00') then
    return (calendar_month + interval '1 month')::date;
  end if;
  return calendar_month;
end;
$$;

create or replace function public.nodal_date_belongs_to_period(target_period_id uuid, target_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.periods
    where id = target_period_id
      and target_date >= public.nodal_first_monday(period_month)
      and target_date <= (public.nodal_first_monday((period_month + interval '1 month')::date) - 3)
  );
$$;

alter table public.periods
  add column if not exists operational_start_on date,
  add column if not exists scheduled_close_at timestamptz,
  add column if not exists lifecycle_status text,
  add column if not exists opened_at timestamptz,
  add column if not exists closed_at timestamptz;

update public.periods
set operational_start_on = public.nodal_first_monday(period_month),
    scheduled_close_at = public.nodal_period_close_at(period_month)
where operational_start_on is null or scheduled_close_at is null;

with selected as (
  select workspace_id,
    coalesce(
      max(period_month) filter (where period_month <= public.nodal_accounting_period_month(now())),
      min(period_month)
    ) as open_month
  from public.periods
  group by workspace_id
)
update public.periods periods
set lifecycle_status = case
      when periods.period_month = selected.open_month then 'open'
      when periods.period_month > selected.open_month then 'scheduled'
      else 'closed'
    end,
    opened_at = case
      when periods.period_month <= selected.open_month then coalesce(periods.opened_at, periods.created_at)
      else null
    end,
    closed_at = case
      when periods.period_month >= selected.open_month then null
      else coalesce(periods.closed_at, periods.scheduled_close_at)
    end
from selected
where selected.workspace_id = periods.workspace_id and periods.lifecycle_status is null;

alter table public.periods
  alter column operational_start_on set not null,
  alter column scheduled_close_at set not null,
  alter column lifecycle_status set not null,
  alter column lifecycle_status set default 'scheduled';

alter table public.periods drop constraint if exists periods_lifecycle_status_valid;
alter table public.periods add constraint periods_lifecycle_status_valid
check (lifecycle_status in ('scheduled', 'open', 'closed', 'closed_with_observations'));

create or replace function public.set_nodal_period_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare active_month date := public.nodal_accounting_period_month(now());
begin
  new.operational_start_on := public.nodal_first_monday(new.period_month);
  new.scheduled_close_at := public.nodal_period_close_at(new.period_month);
  if new.lifecycle_status is null then
    new.lifecycle_status := case
      when new.period_month < active_month then 'closed'
      when new.period_month = active_month then 'open'
      else 'scheduled'
    end;
  end if;
  if new.lifecycle_status = 'open' then
    new.opened_at := coalesce(new.opened_at, now());
  end if;
  return new;
end;
$$;

create trigger periods_set_schedule
before insert or update of period_month on public.periods
for each row execute function public.set_nodal_period_schedule();

create unique index if not exists periods_one_open_per_workspace
on public.periods(workspace_id) where lifecycle_status = 'open';

insert into public.periods(
  workspace_id, period_month, operational_start_on, scheduled_close_at,
  lifecycle_status, opened_at
)
select
  periods.workspace_id,
  (periods.period_month + interval '1 month')::date,
  public.nodal_first_monday((periods.period_month + interval '1 month')::date),
  public.nodal_period_close_at((periods.period_month + interval '1 month')::date),
  'scheduled',
  null
from public.periods periods
where periods.lifecycle_status = 'open'
on conflict (workspace_id, period_month) do nothing;

alter table public.accounts
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict,
  add column if not exists opened_period_id uuid references public.periods(id) on delete restrict;

update public.accounts accounts
set workspace_id = periods.workspace_id,
    opened_period_id = accounts.period_id
from public.periods periods
where periods.id = accounts.period_id
  and (accounts.workspace_id is null or accounts.opened_period_id is null);

alter table public.accounts
  alter column workspace_id set not null,
  alter column opened_period_id set not null;

create or replace function public.set_nodal_account_period_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select periods.workspace_id into new.workspace_id
  from public.periods periods where periods.id = new.period_id;
  if new.workspace_id is null then raise exception 'ACCOUNT_PERIOD_NOT_FOUND'; end if;
  if tg_op = 'INSERT' then new.opened_period_id := new.period_id; end if;
  return new;
end;
$$;

create trigger accounts_set_period_ownership
before insert or update of period_id on public.accounts
for each row execute function public.set_nodal_account_period_ownership();

alter table public.purchases drop constraint if exists purchases_account_id_period_id_fkey;
alter table public.daily_controls drop constraint if exists daily_controls_leader_account_id_period_id_fkey;
alter table public.daily_control_participants drop constraint if exists daily_control_participants_account_id_period_id_fkey;
alter table public.operation_entries drop constraint if exists operation_entries_account_id_period_id_fkey;
alter table public.account_phase_withdrawals drop constraint if exists account_phase_withdrawals_account_id_period_id_fkey;
alter table public.funding_withdrawals drop constraint if exists funding_withdrawals_account_id_period_id_fkey;
alter table public.manual_account_balance_observations drop constraint if exists manual_account_balance_observations_account_id_period_id_fkey;

alter table public.purchases add constraint purchases_account_id_fkey
  foreign key (account_id) references public.accounts(id) on delete restrict;
alter table public.daily_controls add constraint daily_controls_leader_account_id_fkey
  foreign key (leader_account_id) references public.accounts(id) on delete restrict;
alter table public.daily_control_participants add constraint daily_control_participants_account_id_fkey
  foreign key (account_id) references public.accounts(id) on delete restrict;
alter table public.operation_entries add constraint operation_entries_account_id_fkey
  foreign key (account_id) references public.accounts(id) on delete restrict;
alter table public.account_phase_withdrawals add constraint account_phase_withdrawals_account_id_fkey
  foreign key (account_id) references public.accounts(id) on delete restrict;
alter table public.funding_withdrawals add constraint funding_withdrawals_account_id_fkey
  foreign key (account_id) references public.accounts(id) on delete restrict;
alter table public.manual_account_balance_observations add constraint manual_account_balance_observations_account_id_fkey
  foreign key (account_id) references public.accounts(id) on delete cascade;

create table public.account_period_carryovers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  from_period_id uuid not null references public.periods(id) on delete restrict,
  to_period_id uuid not null references public.periods(id) on delete restrict,
  account_state public.account_state not null,
  lifetime_result_cents bigint not null,
  purchase_price_cents bigint not null default 0,
  carried_at timestamptz not null default now(),
  unique(account_id, from_period_id, to_period_id),
  constraint account_period_carryover_changes_period check (from_period_id <> to_period_id),
  constraint account_period_carryover_open_state check (account_state in ('virgin', 'live')),
  constraint account_period_carryover_price_nonnegative check (purchase_price_cents >= 0)
);

create table public.period_closure_versions (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete restrict,
  version integer not null,
  closure_status text not null,
  scheduled_close_at timestamptz not null,
  closed_at timestamptz not null default now(),
  closed_by uuid references auth.users(id) on delete restrict,
  performed_by text not null default 'system',
  realized_gain_cents bigint not null,
  floating_cents bigint not null,
  commission_bps integer,
  commission_base_cents bigint not null,
  commission_cents bigint not null,
  trader_result_cents bigint not null,
  summary_data jsonb not null,
  previous_version_id uuid references public.period_closure_versions(id) on delete restrict,
  reason text not null,
  created_at timestamptz not null default now(),
  unique(period_id, version),
  constraint period_closure_status_valid check (closure_status in ('closed', 'closed_with_observations', 'rectified')),
  constraint period_closure_version_positive check (version > 0),
  constraint period_closure_commission_rate_valid check (commission_bps is null or commission_bps between 0 and 10000),
  constraint period_closure_reason_present check (nullif(btrim(reason), '') is not null)
);

create table public.period_rectifications (
  id uuid primary key default gen_random_uuid(),
  source_period_id uuid not null references public.periods(id) on delete restrict,
  source_closure_version_id uuid not null references public.period_closure_versions(id) on delete restrict,
  adjustment_period_id uuid not null references public.periods(id) on delete restrict,
  result_adjustment_cents bigint not null,
  commission_adjustment_cents bigint not null,
  reason text not null,
  evidence text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint period_rectification_reason_present check (nullif(btrim(reason), '') is not null),
  constraint period_rectification_evidence_present check (nullif(btrim(evidence), '') is not null)
);

create index account_period_carryovers_to_period_idx on public.account_period_carryovers(to_period_id, account_id);
create index period_closure_versions_period_idx on public.period_closure_versions(period_id, version desc);
create index period_rectifications_adjustment_idx on public.period_rectifications(adjustment_period_id);

alter table public.account_period_carryovers enable row level security;
alter table public.period_closure_versions enable row level security;
alter table public.period_rectifications enable row level security;

create policy account_period_carryovers_read_own on public.account_period_carryovers
for select to authenticated using (
  public.can_access_period(from_period_id) or public.can_access_period(to_period_id)
);
create policy period_closure_versions_read_own on public.period_closure_versions
for select to authenticated using (public.can_access_period(period_id));
create policy period_rectifications_read_admin on public.period_rectifications
for select to authenticated using (public.is_current_user_admin());

revoke all on table public.account_period_carryovers, public.period_closure_versions, public.period_rectifications from public, anon;
revoke insert, update, delete on table public.account_period_carryovers, public.period_closure_versions, public.period_rectifications from authenticated;
grant select on table public.account_period_carryovers, public.period_closure_versions to authenticated;
grant select on table public.period_rectifications to authenticated;

create or replace function public.calculate_nodal_account_lifetime_result(target_account_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_origin public.account_state_origin;
  purchase_price bigint := 0;
  positive_cents bigint;
  negative_cents bigint;
  withdrawal_cents bigint;
  phase_total bigint;
  previous_total bigint := 0;
  latest_nonzero bigint := 0;
  carry_cents bigint;
  phase_name public.operation_phase;
  phase_index integer;
begin
  select state_origin into target_origin from public.accounts where id = target_account_id;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  select coalesce(price_cents, 0) into purchase_price from public.purchases where account_id = target_account_id;

  for phase_name, phase_index in
    select phases.phase::public.operation_phase, phases.ordinality::integer
    from unnest(array['Evaluacion','Primera vuelta','Segunda vuelta','Tercera vuelta','Cuarta vuelta','Quinta vuelta']::text[])
      with ordinality as phases(phase, ordinality)
  loop
    select
      coalesce(sum(magnitude_cents) filter (where destination = 'NETO BROKER +'), 0),
      coalesce(sum(magnitude_cents) filter (where destination = 'NETO BROKER -'), 0)
    into positive_cents, negative_cents
    from public.operation_entries
    where account_id = target_account_id and phase = phase_name;

    if phase_name = 'Evaluacion' then
      negative_cents := negative_cents + purchase_price;
      withdrawal_cents := 0;
    else
      select coalesce(total_withdrawal_cents, 0) into withdrawal_cents
      from public.account_phase_withdrawals
      where account_id = target_account_id and phase = phase_name;
      withdrawal_cents := coalesce(withdrawal_cents, 0);
    end if;

    carry_cents := case
      when phase_index = 1 then 0
      when previous_total < 0 then previous_total
      when target_origin = 'manual_live' and previous_total > 0 then previous_total
      else 0
    end;
    phase_total := positive_cents - negative_cents + withdrawal_cents + carry_cents;
    previous_total := phase_total;
    if phase_total <> 0 then latest_nonzero := phase_total; end if;
  end loop;
  return latest_nonzero;
end;
$$;

create or replace function public.close_nodal_accounting_period(
  target_period_id uuid,
  target_summary jsonb,
  target_has_observations boolean default false,
  target_reason text default 'Cierre contable automático'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_period public.periods%rowtype;
  selected_workspace public.workspaces%rowtype;
  next_period_id uuid;
  next_month date;
  closure_id uuid;
  closure_version integer;
  selected_commission_bps integer;
  account_row record;
  account_result bigint;
  purchase_price bigint;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), session_user) not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if target_summary is null or jsonb_typeof(target_summary) <> 'object' or nullif(btrim(target_reason), '') is null then
    raise exception 'INVALID_PERIOD_CLOSE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_period_id::text, 0));
  select * into selected_period from public.periods where id = target_period_id for update;
  if not found then raise exception 'PERIOD_NOT_FOUND'; end if;
  if selected_period.lifecycle_status in ('closed', 'closed_with_observations') then
    select id into closure_id from public.period_closure_versions
    where period_id = target_period_id order by version desc limit 1;
    return closure_id;
  end if;
  if selected_period.lifecycle_status <> 'open' then raise exception 'PERIOD_NOT_OPEN'; end if;
  if now() < selected_period.scheduled_close_at then raise exception 'PERIOD_CLOSE_NOT_DUE'; end if;

  select * into selected_workspace from public.workspaces where id = selected_period.workspace_id;
  next_month := (selected_period.period_month + interval '1 month')::date;
  insert into public.periods(
    workspace_id, period_month, operational_start_on, scheduled_close_at,
    lifecycle_status, opened_at
  ) values (
    selected_period.workspace_id, next_month, public.nodal_first_monday(next_month),
    public.nodal_period_close_at(next_month), 'scheduled', null
  ) on conflict (workspace_id, period_month) do update
    set operational_start_on = excluded.operational_start_on,
        scheduled_close_at = excluded.scheduled_close_at
  returning id into next_period_id;

  if exists (
    select 1 from public.accounts carried
    join public.accounts existing on existing.period_id = next_period_id
      and existing.company_id = carried.company_id
      and existing.reference_number = carried.reference_number
      and existing.id <> carried.id
    where carried.period_id = target_period_id and carried.state in ('virgin', 'live')
  ) then raise exception 'ACCOUNT_REFERENCE_COLLISION'; end if;

  for account_row in
    select id, state from public.accounts
    where period_id = target_period_id and state in ('virgin', 'live')
    for update
  loop
    account_result := public.calculate_nodal_account_lifetime_result(account_row.id);
    select coalesce(price_cents, 0) into purchase_price from public.purchases where account_id = account_row.id;
    insert into public.account_period_carryovers(
      account_id, from_period_id, to_period_id, account_state,
      lifetime_result_cents, purchase_price_cents
    ) values (
      account_row.id, target_period_id, next_period_id, account_row.state,
      account_result, coalesce(purchase_price, 0)
    ) on conflict (account_id, from_period_id, to_period_id) do nothing;
  end loop;

  select commission_bps into selected_commission_bps
  from public.nodal_user_terms
  where user_id = selected_workspace.owner_user_id
    and effective_month <= selected_period.period_month
  order by effective_month desc limit 1;

  select coalesce(max(version), 0) + 1 into closure_version
  from public.period_closure_versions where period_id = target_period_id;

  insert into public.period_closure_versions(
    period_id, version, closure_status, scheduled_close_at, closed_at,
    performed_by, realized_gain_cents, floating_cents, commission_bps,
    commission_base_cents, commission_cents, trader_result_cents,
    summary_data, reason
  ) values (
    target_period_id,
    closure_version,
    case when target_has_observations then 'closed_with_observations' else 'closed' end,
    selected_period.scheduled_close_at,
    now(),
    'system',
    coalesce((target_summary ->> 'realizedGainInCents')::bigint, 0),
    coalesce((target_summary ->> 'floatingInCents')::bigint, 0),
    selected_commission_bps,
    greatest(coalesce((target_summary ->> 'realizedGainInCents')::bigint, 0), 0),
    coalesce((target_summary ->> 'commissionInCents')::bigint, 0),
    coalesce((target_summary ->> 'traderGainInCents')::bigint, 0),
    target_summary,
    btrim(target_reason)
  ) returning id into closure_id;

  update public.periods
  set lifecycle_status = case when target_has_observations then 'closed_with_observations' else 'closed' end,
      closed_at = now()
  where id = target_period_id;

  -- Un solo período puede estar abierto por espacio. El nuevo se abre después
  -- de cerrar el anterior, dentro de esta misma transacción atómica.
  update public.periods
  set lifecycle_status = 'open', opened_at = now()
  where id = next_period_id and lifecycle_status = 'scheduled';

  update public.accounts
  set period_id = next_period_id, updated_at = now()
  where period_id = target_period_id and state in ('virgin', 'live');

  return closure_id;
end;
$$;

create or replace function public.admin_record_period_rectification(
  target_period_id uuid,
  target_result_adjustment_cents bigint,
  target_commission_adjustment_cents bigint,
  target_reason text,
  target_evidence text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  source_closure public.period_closure_versions%rowtype;
  adjustment_period_id uuid;
  rectification_id uuid;
  rectified_closure_id uuid;
  rectified_realized bigint;
  rectified_commission bigint;
  rectified_trader bigint;
  rectified_summary jsonb;
begin
  if actor_id is null or not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if nullif(btrim(target_reason), '') is null or nullif(btrim(target_evidence), '') is null then
    raise exception 'RECTIFICATION_REASON_AND_EVIDENCE_REQUIRED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_period_id::text, 1));
  select * into source_closure from public.period_closure_versions
  where period_id = target_period_id order by version desc limit 1 for update;
  if not found then raise exception 'CLOSED_PERIOD_REQUIRED'; end if;
  select id into adjustment_period_id from public.periods
  where workspace_id = (select workspace_id from public.periods where id = target_period_id)
    and lifecycle_status = 'open';
  if adjustment_period_id is null then raise exception 'OPEN_ADJUSTMENT_PERIOD_REQUIRED'; end if;

  rectified_realized := source_closure.realized_gain_cents + target_result_adjustment_cents;
  rectified_commission := source_closure.commission_cents + target_commission_adjustment_cents;
  rectified_trader := rectified_realized - rectified_commission;
  rectified_summary := source_closure.summary_data || jsonb_build_object(
    'realizedGainInCents', rectified_realized,
    'commissionInCents', rectified_commission,
    'traderGainInCents', rectified_trader
  );

  insert into public.period_closure_versions(
    period_id, version, closure_status, scheduled_close_at, closed_at,
    closed_by, performed_by, realized_gain_cents, floating_cents,
    commission_bps, commission_base_cents, commission_cents,
    trader_result_cents, summary_data, previous_version_id, reason
  ) values (
    target_period_id, source_closure.version + 1, 'rectified',
    source_closure.scheduled_close_at, now(), actor_id, 'admin_master',
    rectified_realized, source_closure.floating_cents,
    source_closure.commission_bps,
    source_closure.commission_base_cents + target_result_adjustment_cents,
    rectified_commission, rectified_trader, rectified_summary,
    source_closure.id, btrim(target_reason)
  ) returning id into rectified_closure_id;

  insert into public.period_rectifications(
    source_period_id, source_closure_version_id, adjustment_period_id,
    result_adjustment_cents, commission_adjustment_cents, reason, evidence, created_by
  ) values (
    target_period_id, rectified_closure_id, adjustment_period_id,
    target_result_adjustment_cents, target_commission_adjustment_cents,
    btrim(target_reason), btrim(target_evidence), actor_id
  ) returning id into rectification_id;
  return rectification_id;
end;
$$;

revoke all on function public.close_nodal_accounting_period(uuid,jsonb,boolean,text) from public, anon, authenticated;
grant execute on function public.close_nodal_accounting_period(uuid,jsonb,boolean,text) to service_role;
revoke all on function public.admin_record_period_rectification(uuid,bigint,bigint,text,text) from public, anon;
grant execute on function public.admin_record_period_rectification(uuid,bigint,bigint,text,text) to authenticated;

-- Los períodos cerrados quedan fuera de los flujos económicos ordinarios.
create or replace function public.enforce_open_accounting_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  selected_period_id uuid := case when tg_op = 'DELETE' then old.period_id else new.period_id end;
begin
  if not exists (
    select 1 from public.periods
    where id = selected_period_id and lifecycle_status = 'open'
  ) then raise exception 'ACCOUNTING_PERIOD_CLOSED'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger accounts_require_open_period before insert or update or delete on public.accounts
for each row execute function public.enforce_open_accounting_period();
create trigger purchases_require_open_period before insert or update or delete on public.purchases
for each row execute function public.enforce_open_accounting_period();
create trigger daily_controls_require_open_period before insert or update or delete on public.daily_controls
for each row execute function public.enforce_open_accounting_period();
create trigger daily_control_participants_require_open_period before insert or update or delete on public.daily_control_participants
for each row execute function public.enforce_open_accounting_period();
create trigger operation_entries_require_open_period before insert or update or delete on public.operation_entries
for each row execute function public.enforce_open_accounting_period();
create trigger account_phase_withdrawals_require_open_period before insert or update or delete on public.account_phase_withdrawals
for each row execute function public.enforce_open_accounting_period();
create trigger funding_withdrawals_require_open_period before insert or update or delete on public.funding_withdrawals
for each row execute function public.enforce_open_accounting_period();
create trigger wallet_movements_require_open_period before insert or update or delete on public.wallet_movements
for each row execute function public.enforce_open_accounting_period();
create trigger manual_account_balances_require_open_period before insert or update or delete on public.manual_account_balance_observations
for each row execute function public.enforce_open_accounting_period();

create or replace function public.create_nodal_purchase(
  target_period_id uuid,
  target_company_id uuid,
  target_price_cents bigint,
  target_funds_origin public.purchase_funds_origin
)
returns table (
  purchase_id uuid, account_id uuid, purchase_number integer,
  reference_number integer, purchased_on date
)
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  business_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  next_purchase_number integer;
  next_reference_number integer;
  new_account_id uuid;
  new_purchase_id uuid;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;
  if target_price_cents is null or target_price_cents < 0 then raise exception 'The purchase price must be nonnegative'; end if;

  perform 1
  from public.periods periods
  join public.workspaces spaces on spaces.id = periods.workspace_id
  join public.nodal_users users on users.id = spaces.owner_user_id
  where periods.id = target_period_id and spaces.owner_user_id = actor_id
    and users.access_state = 'active' and periods.lifecycle_status = 'open'
  for update of periods;
  if not found then raise exception 'The selected period is not available to this user'; end if;
  if not public.nodal_date_belongs_to_period(target_period_id, business_today) then
    raise exception 'Purchases can only be registered in the selected open period';
  end if;
  if not exists (
    select 1 from public.companies companies
    where companies.id = target_company_id and companies.is_active
      and (companies.valid_from is null or companies.valid_from <= business_today)
      and (companies.valid_until is null or companies.valid_until >= business_today)
  ) then raise exception 'The selected company is not currently available'; end if;

  select coalesce(max(purchases.purchase_number), 0) + 1 into next_purchase_number
  from public.purchases purchases where purchases.period_id = target_period_id;
  select coalesce(max(accounts.reference_number), 0) + 1 into next_reference_number
  from public.accounts accounts
  where accounts.workspace_id = (select workspace_id from public.periods where id=target_period_id)
    and accounts.company_id = target_company_id;

  insert into public.accounts(period_id,company_id,reference_number,state,created_by)
  values(target_period_id,target_company_id,next_reference_number,'virgin',actor_id)
  returning id into new_account_id;
  insert into public.purchases(
    period_id,account_id,purchase_number,purchased_on,price_cents,funds_origin,created_by
  ) values (
    target_period_id,new_account_id,next_purchase_number,business_today,
    target_price_cents,target_funds_origin,actor_id
  ) returning id into new_purchase_id;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(actor_id,'purchases',new_purchase_id,'purchase_created',jsonb_build_object(
    'period_id',target_period_id,'account_id',new_account_id,'company_id',target_company_id,
    'purchase_number',next_purchase_number,'reference_number',next_reference_number,
    'purchased_on',business_today,'price_cents',target_price_cents,
    'funds_origin',target_funds_origin,'account_state','virgin'
  ),'Compra confirmada por el usuario');
  return query select new_purchase_id,new_account_id,next_purchase_number,next_reference_number,business_today;
end;
$$;

create or replace function public.create_nodal_detected_purchase(
  target_period_id uuid,target_company_id uuid,target_price_cents bigint,
  target_funds_origin public.purchase_funds_origin,target_purchased_on date,
  target_connector_id uuid,target_connection_name text,target_external_account_name text,
  target_first_seen_at timestamptz
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  business_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  next_purchase_number integer; next_reference_number integer;
  new_account_id uuid; new_purchase_id uuid;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;
  if target_price_cents is null or target_price_cents < 0 then raise exception 'Invalid purchase price'; end if;
  if target_purchased_on is null or target_purchased_on > business_today then raise exception 'Invalid purchase date'; end if;
  if target_connector_id is null or nullif(btrim(target_connection_name), '') is null
    or nullif(btrim(target_external_account_name), '') is null then raise exception 'Invalid Ninja identity'; end if;
  perform 1 from public.periods periods
  join public.workspaces spaces on spaces.id=periods.workspace_id
  join public.nodal_users users on users.id=spaces.owner_user_id
  where periods.id=target_period_id and spaces.owner_user_id=actor_id
    and users.access_state='active' and periods.lifecycle_status='open'
  for update of periods;
  if not found then raise exception 'The selected period is not available to this user'; end if;
  if not public.nodal_date_belongs_to_period(target_period_id,target_purchased_on) then
    raise exception 'Purchase date must belong to selected period';
  end if;
  if not exists(select 1 from public.ninja_connectors connectors
    where connectors.id=target_connector_id and connectors.owner_user_id=actor_id and connectors.status='active')
    then raise exception 'Connector is not active for this user'; end if;
  if exists(select 1 from public.ninja_connector_connection_reviews reviews
    where reviews.connector_id=target_connector_id and reviews.connection_name=btrim(target_connection_name)
      and reviews.status='isolated') then raise exception 'Ninja connection is isolated for this user'; end if;
  if not exists(select 1 from public.ninja_inventory_snapshots snapshots,
    jsonb_array_elements(snapshots.accounts) account
    where snapshots.connector_id=target_connector_id
      and account->>'connectionName'=btrim(target_connection_name)
      and account->>'accountName'=btrim(target_external_account_name))
    then raise exception 'Ninja account was not observed for this user'; end if;
  if exists(select 1 from public.ninja_account_links links
    where links.connector_id=target_connector_id and links.connection_name=btrim(target_connection_name)
      and links.external_account_name=btrim(target_external_account_name) and links.closed_at is null)
    then raise exception 'Ninja account already linked'; end if;
  if not exists(select 1 from public.companies where id=target_company_id and is_active)
    then raise exception 'Company is not available'; end if;
  select coalesce(max(purchase_number),0)+1 into next_purchase_number
  from public.purchases where period_id=target_period_id;
  select coalesce(max(reference_number),0)+1 into next_reference_number
  from public.accounts where workspace_id=(select workspace_id from public.periods where id=target_period_id)
    and company_id=target_company_id;
  insert into public.accounts(period_id,company_id,reference_number,state,created_by)
  values(target_period_id,target_company_id,next_reference_number,'virgin',actor_id)
  returning id into new_account_id;
  insert into public.purchases(period_id,account_id,purchase_number,purchased_on,price_cents,funds_origin,created_by)
  values(target_period_id,new_account_id,next_purchase_number,target_purchased_on,target_price_cents,target_funds_origin,actor_id)
  returning id into new_purchase_id;
  insert into public.ninja_account_links(account_id,connector_id,connection_name,external_account_name,first_seen_at,linked_by)
  values(new_account_id,target_connector_id,btrim(target_connection_name),btrim(target_external_account_name),target_first_seen_at,actor_id);
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(actor_id,'purchases',new_purchase_id,'detected_purchase_created',jsonb_build_object(
    'account_id',new_account_id,'external_account_name',btrim(target_external_account_name),
    'connection_name',btrim(target_connection_name),'purchased_on',target_purchased_on,
    'price_cents',target_price_cents,'funds_origin',target_funds_origin
  ),'Compra detectada en Ninja y confirmada por el usuario');
  return new_purchase_id;
end;
$$;

-- Conserva los flujos transaccionales existentes y sustituye únicamente la
-- antigua validación por mes calendario. Cada sustitución falla de forma
-- explícita si la firma o el cuerpo instalado no coinciden con lo esperado.
do $period_compatibility$
declare
  definition text;
  original_definition text;
begin
  select pg_get_functiondef('public.confirm_nodal_daily_control(uuid,public.daily_control_kind,date,uuid,bigint,bigint,public.daily_control_origin_destination,uuid,uuid,uuid[],public.operation_phase,text,public.daily_control_source,text,bigint,text)'::regprocedure) into definition;
  original_definition := definition;
  definition := replace(definition,
    'date_trunc(''month'', target_operated_on)::date <> selected_period_month',
    'not public.nodal_date_belongs_to_period(target_period_id, target_operated_on)');
  if definition = original_definition and position('nodal_date_belongs_to_period(target_period_id, target_operated_on)' in definition)=0 then raise exception 'PERIOD_PATCH_DAILY_CONTROL_FAILED'; end if;
  if definition <> original_definition then execute definition; end if;

  select pg_get_functiondef('public.create_nodal_wallet(uuid,text,bigint,date)'::regprocedure) into definition;
  original_definition := definition;
  definition := replace(definition,
    'date_trunc(''month'', target_opened_on)::date <> selected_month',
    'not public.nodal_date_belongs_to_period(target_period_id, target_opened_on)');
  if definition = original_definition and position('nodal_date_belongs_to_period(target_period_id, target_opened_on)' in definition)=0 then raise exception 'PERIOD_PATCH_WALLET_FAILED'; end if;
  if definition <> original_definition then execute definition; end if;

  select pg_get_functiondef('public.create_nodal_wallet_movement(uuid,uuid,date,text,bigint,bigint,text)'::regprocedure) into definition;
  original_definition := definition;
  definition := replace(definition,
    'date_trunc(''month'',target_occurred_on)::date<>period_month',
    'not public.nodal_date_belongs_to_period(target_period_id,target_occurred_on)');
  if definition = original_definition and position('nodal_date_belongs_to_period(target_period_id,target_occurred_on)' in definition)=0 then raise exception 'PERIOD_PATCH_WALLET_MOVEMENT_FAILED'; end if;
  if definition <> original_definition then execute definition; end if;

  select pg_get_functiondef('public.create_nodal_funding_withdrawal(uuid,uuid,date,bigint)'::regprocedure) into definition;
  original_definition := definition;
  definition := replace(definition,
    'date_trunc(''month'', target_approved_on)::date <> period_month',
    'not public.nodal_date_belongs_to_period(target_period_id, target_approved_on)');
  if definition = original_definition and position('nodal_date_belongs_to_period(target_period_id, target_approved_on)' in definition)=0 then raise exception 'PERIOD_PATCH_FUNDING_FAILED'; end if;
  if definition <> original_definition then execute definition; end if;

  select pg_get_functiondef('public.create_nodal_wallet_transfer(uuid,uuid,uuid,date,bigint,bigint,text)'::regprocedure) into definition;
  original_definition := definition;
  definition := replace(definition,
    'date_trunc(''month'', target_occurred_on)::date <> selected_month',
    'not public.nodal_date_belongs_to_period(target_period_id, target_occurred_on)');
  if definition = original_definition and position('nodal_date_belongs_to_period(target_period_id, target_occurred_on)' in definition)=0 then raise exception 'PERIOD_PATCH_WALLET_TRANSFER_FAILED'; end if;
  if definition <> original_definition then execute definition; end if;

  select pg_get_functiondef('public.register_ninja_reset_purchase(uuid,uuid,bigint,public.purchase_funds_origin,date)'::regprocedure) into definition;
  original_definition := definition;
  definition := replace(definition,
    'date_trunc(''month'', target_purchased_on)::date <> (select period_month from public.periods where id = target_period_id)',
    'not public.nodal_date_belongs_to_period(target_period_id, target_purchased_on)');
  if definition = original_definition and position('nodal_date_belongs_to_period(target_period_id, target_purchased_on)' in definition)=0 then raise exception 'PERIOD_PATCH_RESET_PURCHASE_FAILED'; end if;
  if definition <> original_definition then execute definition; end if;

  select pg_get_functiondef('public.confirm_ninja_uncovered_trade(uuid,bigint,boolean)'::regprocedure) into definition;
  original_definition := definition;
  definition := replace(definition,
    'p.period_month=date_trunc(''month'',opdate)::date',
    'p.lifecycle_status=''open'' and public.nodal_date_belongs_to_period(p.id,opdate)');
  if definition = original_definition and position('nodal_date_belongs_to_period(p.id,opdate)' in definition)=0 then raise exception 'PERIOD_PATCH_UNCOVERED_FAILED'; end if;
  if definition <> original_definition then execute definition; end if;
end;
$period_compatibility$;

-- Los acuerdos del panel maestro siguen el período contable activo, no el mes
-- calendario. Un cambio dentro del período reemplaza el porcentaje para todo
-- ese período y el cierre conserva el valor definitivo.
create or replace function public.admin_save_user_terms(
  p_user uuid,p_month date,p_desk uuid,p_level integer,p_state text,p_commission integer,p_bonus boolean
)
returns void language plpgsql security definer set search_path='' as $$
declare old_row jsonb; new_row jsonb; current_month date := public.nodal_accounting_period_month(now());
begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_month is null or p_month <> current_month or extract(day from p_month)<>1 then raise exception 'INVALID_EFFECTIVE_MONTH'; end if;
  perform pg_advisory_xact_lock(9080701);
  if not exists(select 1 from public.nodal_users where id=p_user and access_state='active') then raise exception 'USER_NOT_ACTIVE'; end if;
  if not coalesce((select active from public.nodal_desk_terms where desk_id=p_desk and effective_month<=p_month order by effective_month desc limit 1),false) then raise exception 'DESK_NOT_ACTIVE'; end if;
  select to_jsonb(t) into old_row from public.nodal_user_terms t where user_id=p_user and effective_month<=p_month order by effective_month desc limit 1;
  insert into public.nodal_user_terms values(p_user,p_month,p_desk,p_level,p_state,p_commission,p_bonus)
  on conflict(user_id,effective_month) do update set desk_id=excluded.desk_id,level=excluded.level,state=excluded.state,commission_bps=excluded.commission_bps,bonus_enabled=excluded.bonus_enabled;
  select to_jsonb(t) into new_row from public.nodal_user_terms t where user_id=p_user and effective_month=p_month;
  if old_row is distinct from new_row then
    insert into public.nodal_management_history(user_id,desk_id,actor_id,effective_month,action,before_data,after_data)
    values(p_user,p_desk,auth.uid(),p_month,'user_terms',old_row,new_row);
  end if;
end $$;

create or replace function public.admin_save_desk(
  p_id uuid,p_name text,p_parent uuid,p_manager uuid,p_month date,p_nodal integer,p_active boolean
)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid:=p_id; old_row jsonb; new_row jsonb; current_month date:=public.nodal_accounting_period_month(now()); manager_level integer; origin uuid; bonus_owner uuid; previous_count integer; next_count integer;
begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_month is null or p_month<>current_month or extract(day from p_month)<>1 then raise exception 'INVALID_EFFECTIVE_MONTH'; end if;
  perform pg_advisory_xact_lock(9080701);
  if p_manager is null or not exists(select 1 from public.nodal_users where id=p_manager and access_state='active') then raise exception 'USER_NOT_ACTIVE'; end if;
  origin:=case when target is null then p_parent else (select parent_id from public.nodal_desks where id=target) end;
  if p_active and not coalesce((select active from public.nodal_desk_terms where desk_id=origin and effective_month<=p_month order by effective_month desc limit 1),false) then raise exception 'DESK_NOT_ACTIVE'; end if;
  select manager_id into bonus_owner from public.nodal_desk_terms where desk_id=origin and effective_month<=p_month order by effective_month desc limit 1;
  select count(*) into previous_count from public.nodal_desks d join lateral (select active from public.nodal_desk_terms where desk_id=d.id and effective_month<=p_month order by effective_month desc limit 1) t on t.active where d.parent_id=origin;
  select level into manager_level from public.nodal_user_terms where user_id=p_manager and effective_month<=p_month order by effective_month desc limit 1;
  if coalesce(manager_level,1)<2 then raise exception 'LEVEL_TWO_REQUIRED'; end if;
  if exists(select 1 from (select distinct on(desk_id) * from public.nodal_desk_terms where effective_month<=p_month order by desk_id,effective_month desc) t where manager_id=p_manager and active and desk_id is distinct from target) then raise exception 'ALREADY_MANAGES_DESK'; end if;
  if target is null then
    if not coalesce((select active from public.nodal_desk_terms where desk_id=p_parent and effective_month<=p_month order by effective_month desc limit 1),false) then raise exception 'DESK_NOT_ACTIVE'; end if;
    insert into public.nodal_desks(name,parent_id) values(p_name,p_parent) returning id into target;
  else
    if not exists(select 1 from public.nodal_desks where id=target and parent_id is not null) then raise exception 'INVALID_DESK'; end if;
    select to_jsonb(t) into old_row from public.nodal_desk_terms t where desk_id=target and effective_month<=p_month order by effective_month desc limit 1;
  end if;
  if not p_active and (exists(select 1 from (select distinct on(user_id) * from public.nodal_user_terms where effective_month<=p_month order by user_id,effective_month desc) t where desk_id=target) or exists(select 1 from public.nodal_desks d join lateral (select active from public.nodal_desk_terms where desk_id=d.id and effective_month<=p_month order by effective_month desc limit 1) t on t.active where d.parent_id=target)) then raise exception 'DESK_HAS_MEMBERS'; end if;
  insert into public.nodal_desk_terms values(target,p_month,p_manager,p_nodal,p_active)
  on conflict(desk_id,effective_month) do update set manager_id=excluded.manager_id,nodal_bps=excluded.nodal_bps,active=excluded.active;
  select to_jsonb(t) into new_row from public.nodal_desk_terms t where desk_id=target and effective_month=p_month;
  insert into public.nodal_management_history(user_id,desk_id,actor_id,effective_month,action,before_data,after_data)
  values(p_manager,target,auth.uid(),p_month,'desk_terms',old_row,new_row);
  if old_row->>'manager_id' is not null and old_row->>'manager_id'<>p_manager::text then
    insert into public.nodal_management_history(user_id,desk_id,actor_id,effective_month,action,before_data,after_data)
    values((old_row->>'manager_id')::uuid,target,auth.uid(),p_month,'manager_replaced',old_row,new_row);
  end if;
  select count(*) into next_count from public.nodal_desks d join lateral (select active from public.nodal_desk_terms where desk_id=d.id and effective_month<=p_month order by effective_month desc limit 1) t on t.active where d.parent_id=origin;
  if bonus_owner is not null and previous_count<>next_count then
    insert into public.nodal_management_history(user_id,desk_id,actor_id,effective_month,action,before_data,after_data)
    values(bonus_owner,origin,auth.uid(),p_month,'bonus_threshold',
      jsonb_build_object('direct_desks',previous_count,'bonus_bps',case when previous_count>=10 then 5000 when previous_count>=5 then 4000 when previous_count>=3 then 3000 when previous_count>=1 then 1500 else 0 end),
      jsonb_build_object('direct_desks',next_count,'bonus_bps',case when next_count>=10 then 5000 when next_count>=5 then 4000 when next_count>=3 then 3000 when next_count>=1 then 1500 else 0 end));
  end if;
  return target;
end $$;

comment on column public.accounts.period_id is 'Período contable activo o de cierre de la cuenta; cambia al trasladar una cuenta virgen o viva.';
comment on column public.accounts.opened_period_id is 'Período original e inmutable en el que se registró la compra.';
comment on table public.account_period_carryovers is 'Fotografía individual del traslado de cuentas vírgenes y vivas entre períodos.';
comment on table public.period_closure_versions is 'Cierres contables inmutables y versionados; una rectificación crea una nueva versión lógica.';
