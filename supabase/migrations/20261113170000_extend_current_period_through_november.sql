-- Excepción aprobada: el período 2026-10 permanece vigente durante todo
-- noviembre de 2026 y cierra al comenzar el 1 de diciembre (hora Argentina).

begin;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

select pg_advisory_xact_lock(hashtextextended('nodal-period-extension-20261113', 0));

do $$
begin
  if exists (
    select 1
    from public.periods
    where period_month = '2026-10-01'::date
      and closed_at is not null
  ) or exists (
    select 1
    from public.period_closure_versions closures
    join public.periods periods on periods.id = closures.period_id
    where periods.period_month = '2026-10-01'::date
  ) then
    raise exception 'CURRENT_PERIOD_ALREADY_CLOSED';
  end if;
end;
$$;

create schema if not exists private_period_extension_20261113;
revoke all on schema private_period_extension_20261113 from public, anon, authenticated;

create table if not exists private_period_extension_20261113.periods as
select *
from public.periods
where period_month in ('2026-10-01'::date, '2026-11-01'::date);

alter table private_period_extension_20261113.periods enable row level security;

create or replace function public.nodal_period_start_on(target_month date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when date_trunc('month', target_month)::date = '2026-11-01'::date
      then '2026-12-01'::date
    else public.nodal_cutoff_friday(target_month) + 3
  end;
$$;

create or replace function public.nodal_period_close_at(target_month date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when date_trunc('month', target_month)::date = '2026-10-01'::date
      then '2026-11-30T23:59:59-03:00'::timestamptz
    else (
      public.nodal_cutoff_friday((date_trunc('month', target_month) + interval '1 month')::date)
      + time '19:00'
    ) at time zone 'America/Argentina/Buenos_Aires'
  end;
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
  if local_moment >= '2026-11-01 00:00:00'::timestamp
     and local_moment < '2026-12-01 00:00:00'::timestamp then
    return '2026-10-01'::date;
  end if;
  if local_moment < current_cutover then
    return (calendar_month - interval '1 month')::date;
  end if;
  return calendar_month;
end;
$$;

insert into public.audit_events(
  actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
)
select
  'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid,
  'periods', previous.id, 'period_close_extended', to_jsonb(previous),
  jsonb_build_object(
    'period_month', previous.period_month,
    'scheduled_close_at', case
      when previous.period_month = '2026-10-01'::date then '2026-11-30T23:59:59-03:00'::timestamptz
      else previous.scheduled_close_at
    end,
    'operational_start_on', case
      when previous.period_month = '2026-11-01'::date then '2026-12-01'::date
      else previous.operational_start_on
    end
  ),
  'Extensión excepcional aprobada del período vigente hasta el final de noviembre de 2026'
from private_period_extension_20261113.periods previous
where not exists (
  select 1
  from public.audit_events audit
  where audit.entity_table = 'periods'
    and audit.entity_id = previous.id
    and audit.action = 'period_close_extended'
    and audit.reason = 'Extensión excepcional aprobada del período vigente hasta el final de noviembre de 2026'
);

update public.periods
set scheduled_close_at = '2026-11-30T23:59:59-03:00'::timestamptz
where period_month = '2026-10-01'::date
  and lifecycle_status in ('open', 'scheduled');

update public.periods
set operational_start_on = '2026-12-01'::date
where period_month = '2026-11-01'::date
  and lifecycle_status = 'scheduled';

do $$
begin
  if exists (
    select 1 from public.periods
    where period_month = '2026-10-01'::date
      and lifecycle_status in ('open', 'scheduled')
      and scheduled_close_at <> '2026-11-30T23:59:59-03:00'::timestamptz
  ) then raise exception 'CURRENT_PERIOD_EXTENSION_FAILED'; end if;

  if exists (
    select 1 from public.periods
    where period_month = '2026-11-01'::date
      and lifecycle_status = 'scheduled'
      and operational_start_on <> '2026-12-01'::date
  ) then raise exception 'NEXT_PERIOD_RESCHEDULE_FAILED'; end if;

  if public.nodal_accounting_period_month('2026-11-30T23:59:59-03:00'::timestamptz)
       <> '2026-10-01'::date
     or public.nodal_accounting_period_month('2026-12-01T00:00:00-03:00'::timestamptz)
       <> '2026-11-01'::date
  then raise exception 'PERIOD_BOUNDARY_VALIDATION_FAILED'; end if;
end;
$$;

commit;
