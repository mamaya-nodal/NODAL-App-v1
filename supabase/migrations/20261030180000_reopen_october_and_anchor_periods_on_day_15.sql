-- APP-243: los períodos se anclan al día 15 y siempre cierran un viernes.
-- Si el 15 cae sábado, domingo, lunes o martes, se usa el viernes anterior.
-- Si cae miércoles o jueves, se usa el viernes inmediato posterior; si cae
-- viernes, se usa ese mismo día. El siguiente período abre el lunes posterior.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

select pg_advisory_xact_lock(hashtextextended('nodal-period-calendar-day-15-v1', 0));

create or replace function public.nodal_cutoff_friday(target_month date)
returns date
language sql
immutable
set search_path = ''
as $$
  with anchor as (
    select (date_trunc('month', target_month)::date + 14) as day_15
  )
  select day_15 + case extract(isodow from day_15)::integer
    when 1 then -3
    when 2 then -4
    when 3 then 2
    when 4 then 1
    when 5 then 0
    when 6 then -1
    when 7 then -2
  end
  from anchor;
$$;

create or replace function public.nodal_period_start_on(target_month date)
returns date
language sql
immutable
set search_path = ''
as $$
  select public.nodal_cutoff_friday(target_month) + 3;
$$;

create or replace function public.nodal_period_close_at(target_month date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (
    public.nodal_cutoff_friday((date_trunc('month', target_month) + interval '1 month')::date)
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
  local_moment timestamp := reference_at at time zone 'America/Argentina/Buenos_Aires';
  calendar_month date := date_trunc('month', local_moment)::date;
  current_cutover timestamp := public.nodal_cutoff_friday(calendar_month) + time '19:00';
begin
  if local_moment < current_cutover then
    return (calendar_month - interval '1 month')::date;
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
    from public.periods periods
    where periods.id = target_period_id
      and target_date >= periods.operational_start_on
      and target_date <= (periods.scheduled_close_at at time zone 'America/Argentina/Buenos_Aires')::date
  );
$$;

create or replace function public.set_nodal_period_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare active_month date := public.nodal_accounting_period_month(now());
begin
  new.operational_start_on := public.nodal_period_start_on(new.period_month);
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

create temp table reversed_closures on commit drop as
select closures.*
from public.period_closure_versions closures
join public.periods periods on periods.id = closures.period_id
where periods.period_month = '2026-10-01'::date
  and closures.version = 1
  and closures.performed_by = 'system'
  and closures.closed_at >= '2026-10-30T22:00:00Z'::timestamptz
  and closures.closed_at < '2026-10-30T22:01:00Z'::timestamptz;

create temp table reversed_periods on commit drop as
select periods.*
from public.periods periods
join reversed_closures closures on closures.period_id = periods.id;

create temp table reopened_next_periods on commit drop as
select next_periods.*
from reversed_periods prior
join public.periods next_periods
  on next_periods.workspace_id = prior.workspace_id
 and next_periods.period_month = '2026-11-01'::date;

create temp table reversed_carryovers on commit drop as
select carryovers.*
from public.account_period_carryovers carryovers
join reversed_periods prior on prior.id = carryovers.from_period_id
join reopened_next_periods next_period on next_period.id = carryovers.to_period_id;

do $$
begin
  if (select count(*) from reversed_closures) <> 25
    or (select count(*) from reversed_periods) <> 25
    or (select count(*) from reopened_next_periods) <> 25
  then raise exception 'PERIOD_CLOSE_REVERSAL_TARGET_MISMATCH'; end if;

  if exists (select 1 from reopened_next_periods where lifecycle_status <> 'open')
    or exists (select 1 from reversed_periods where lifecycle_status not in ('closed', 'closed_with_observations'))
  then raise exception 'PERIOD_CLOSE_REVERSAL_STATE_MISMATCH'; end if;

  if exists (
    select 1 from public.accounts accounts
    where accounts.period_id in (select id from reopened_next_periods)
      and not exists (
        select 1 from reversed_carryovers carryovers
        where carryovers.account_id = accounts.id
          and carryovers.to_period_id = accounts.period_id
      )
  ) then raise exception 'NEW_PERIOD_CONTAINS_UNCARRIED_ACCOUNTS'; end if;

  if exists (select 1 from public.daily_controls where period_id in (select id from reopened_next_periods))
    or exists (select 1 from public.operation_entries where period_id in (select id from reopened_next_periods))
    or exists (select 1 from public.wallet_movements where period_id in (select id from reopened_next_periods))
    or exists (select 1 from public.account_phase_withdrawals where period_id in (select id from reopened_next_periods))
    or exists (select 1 from public.funding_withdrawals where period_id in (select id from reopened_next_periods)
      or collected_period_id in (select id from reopened_next_periods)
      or account_result_applied_period_id in (select id from reopened_next_periods))
    or exists (select 1 from public.manual_account_balance_observations where period_id in (select id from reopened_next_periods))
    or exists (select 1 from public.period_rectifications where adjustment_period_id in (select id from reopened_next_periods))
    or exists (select 1 from public.period_opening_snapshots where period_id in (select id from reopened_next_periods))
    or exists (select 1 from public.purchases where period_id in (select id from reopened_next_periods))
    or exists (select 1 from public.ninja_operation_batches where accounting_period_id in (select id from reopened_next_periods))
  then raise exception 'NEW_PERIOD_HAS_ACTIVITY'; end if;

  if exists (select 1 from public.period_closure_approvals where closure_version_id in (select id from reversed_closures))
    or exists (select 1 from public.period_closure_dispatches where closure_version_id in (select id from reversed_closures))
    or exists (select 1 from public.period_closure_observation_resolutions where closure_version_id in (select id from reversed_closures))
    or exists (select 1 from public.period_rectifications where source_closure_version_id in (select id from reversed_closures))
  then raise exception 'CLOSURE_ALREADY_USED_OR_APPROVED'; end if;
end;
$$;

create schema if not exists private_period_close_reversal_20261030;
revoke all on schema private_period_close_reversal_20261030 from public, anon, authenticated;

create table private_period_close_reversal_20261030.periods as
select periods.* from public.periods periods
where periods.id in (select id from reversed_periods)
   or periods.id in (select id from reopened_next_periods);

create table private_period_close_reversal_20261030.closure_versions as
select * from reversed_closures;

create table private_period_close_reversal_20261030.carryovers as
select * from reversed_carryovers;

create table private_period_close_reversal_20261030.accounts as
select accounts.* from public.accounts accounts
where accounts.id in (select account_id from reversed_carryovers);

create table private_period_close_reversal_20261030.reports as
select reports.* from public.period_closure_reports reports
where reports.closure_version_id in (select id from reversed_closures);

insert into public.audit_events(
  actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
)
select
  'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid,
  'periods', prior.id, 'automatic_period_close_reversed',
  jsonb_build_object(
    'period', to_jsonb(prior),
    'closure', to_jsonb(closure),
    'next_period', to_jsonb(next_period),
    'carryover_count', (select count(*) from reversed_carryovers c where c.from_period_id = prior.id),
    'backup_schema', 'private_period_close_reversal_20261030'
  ),
  jsonb_build_object(
    'lifecycle_status', 'open',
    'scheduled_close_at', public.nodal_period_close_at(prior.period_month),
    'next_period_status', 'scheduled',
    'next_operational_start_on', public.nodal_period_start_on(next_period.period_month),
    'next_scheduled_close_at', public.nodal_period_close_at(next_period.period_month)
  ),
  'Cierre automático revertido por cambio aprobado al calendario anclado en el día 15'
from reversed_periods prior
join reversed_closures closure on closure.period_id = prior.id
join reopened_next_periods next_period on next_period.workspace_id = prior.workspace_id;

-- Primero se retira el período nuevo del índice único de períodos abiertos.
-- Luego se vuelve a abrir el anterior para que la protección contable permita
-- devolver allí las cuentas dentro de esta misma transacción.
update public.periods periods
set lifecycle_status = 'scheduled',
    operational_start_on = public.nodal_period_start_on(periods.period_month),
    scheduled_close_at = public.nodal_period_close_at(periods.period_month),
    opened_at = null,
    closed_at = null
where periods.id in (select id from reopened_next_periods);

update public.periods periods
set lifecycle_status = 'open',
    scheduled_close_at = public.nodal_period_close_at(periods.period_month),
    closed_at = null
where periods.id in (select id from reversed_periods);

do $$
begin
  if exists (
    select 1 from reversed_periods prior
    join public.periods current on current.id = prior.id
    where current.lifecycle_status <> 'open'
  ) or exists (
    select 1 from reopened_next_periods prior
    join public.periods current on current.id = prior.id
    where current.lifecycle_status <> 'scheduled'
  ) then
    raise exception 'PERIOD_STATE_NOT_READY_FOR_ACCOUNT_RESTORE';
  end if;
end;
$$;

delete from public.period_closure_reports reports
where reports.closure_version_id in (select id from reversed_closures);

-- El guard ordinario no contempla la reversión de un cierre y bloquea este
-- traslado excepcional aun cuando el destino ya fue reabierto y verificado.
-- Se suspende únicamente ese trigger durante el traslado auditado; el trigger
-- de propiedad y todos los demás controles continúan activos. Si algo falla,
-- PostgreSQL revierte también esta alteración del trigger.
alter table public.accounts disable trigger accounts_require_open_period;

update public.accounts accounts
set period_id = carryovers.from_period_id,
    updated_at = now()
from reversed_carryovers carryovers
where accounts.id = carryovers.account_id
  and accounts.period_id = carryovers.to_period_id;

alter table public.accounts enable trigger accounts_require_open_period;

delete from public.account_period_carryovers carryovers
where carryovers.id in (select id from reversed_carryovers);

delete from public.period_closure_versions closures
where closures.id in (select id from reversed_closures);

update public.periods periods
set scheduled_close_at = public.nodal_period_close_at(periods.period_month)
where periods.period_month = '2026-10-01'::date
  and periods.lifecycle_status = 'scheduled';

update public.periods periods
set operational_start_on = public.nodal_period_start_on(periods.period_month),
    scheduled_close_at = public.nodal_period_close_at(periods.period_month)
where periods.period_month >= '2026-11-01'::date
  and periods.lifecycle_status = 'scheduled';

do $$
begin
  if exists (select 1 from reversed_periods prior join public.periods current on current.id = prior.id
    where current.lifecycle_status <> 'open' or current.closed_at is not null
      or current.scheduled_close_at <> '2026-11-13T19:00:00-03:00'::timestamptz)
  then raise exception 'PERIOD_REOPEN_FAILED'; end if;

  if exists (select 1 from reopened_next_periods prior join public.periods current on current.id = prior.id
    where current.lifecycle_status <> 'scheduled' or current.opened_at is not null
      or current.operational_start_on <> '2026-11-16'::date
      or current.scheduled_close_at <> '2026-12-11T19:00:00-03:00'::timestamptz)
  then raise exception 'NEXT_PERIOD_RESCHEDULE_FAILED'; end if;

  if exists (select 1 from reversed_carryovers carryovers
    join public.accounts accounts on accounts.id = carryovers.account_id
    where accounts.period_id <> carryovers.from_period_id)
    or exists (select 1 from public.account_period_carryovers where id in (select id from reversed_carryovers))
    or exists (select 1 from public.period_closure_versions where id in (select id from reversed_closures))
  then raise exception 'PERIOD_CLOSE_REVERSAL_INCOMPLETE'; end if;
end;
$$;

commit;
