-- Controles operativos del cierre contable: ajustes de períodos anteriores,
-- resolución explicada de observaciones y registro persistente de ejecuciones.

create table public.period_closure_observation_resolutions (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete restrict,
  closure_version_id uuid not null references public.period_closure_versions(id) on delete restrict,
  resolution text not null,
  evidence text not null,
  resolved_by uuid not null references auth.users(id) on delete restrict,
  resolved_at timestamptz not null default now(),
  unique (closure_version_id),
  constraint period_closure_resolution_present check (nullif(btrim(resolution), '') is not null),
  constraint period_closure_resolution_evidence_present check (nullif(btrim(evidence), '') is not null)
);

create table public.accounting_period_close_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_source text not null,
  requested_by uuid references auth.users(id) on delete restrict,
  status text not null default 'running',
  due_period_count integer not null default 0,
  closed_period_count integer not null default 0,
  failures jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint accounting_close_run_source_valid check (trigger_source in ('scheduled', 'manual')),
  constraint accounting_close_run_status_valid check (status in ('running', 'succeeded', 'partial', 'failed')),
  constraint accounting_close_run_counts_nonnegative check (due_period_count >= 0 and closed_period_count >= 0),
  constraint accounting_close_run_failures_array check (jsonb_typeof(failures) = 'array')
);

create index period_closure_resolutions_period_idx
on public.period_closure_observation_resolutions(period_id, resolved_at desc);

create index accounting_period_close_runs_started_idx
on public.accounting_period_close_runs(started_at desc);

alter table public.period_closure_observation_resolutions enable row level security;
alter table public.accounting_period_close_runs enable row level security;

create policy period_closure_resolutions_read_allowed
on public.period_closure_observation_resolutions for select to authenticated
using (public.can_access_period(period_id) or public.is_current_user_admin());

create policy accounting_close_runs_master_read
on public.accounting_period_close_runs for select to authenticated
using (public.is_current_user_admin());

drop policy if exists period_rectifications_read_admin on public.period_rectifications;
create policy period_rectifications_read_allowed
on public.period_rectifications for select to authenticated
using (
  public.is_current_user_admin()
  or public.can_access_period(source_period_id)
  or public.can_access_period(adjustment_period_id)
);

revoke all on table public.period_closure_observation_resolutions, public.accounting_period_close_runs
from public, anon;
revoke insert, update, delete on table public.period_closure_observation_resolutions, public.accounting_period_close_runs
from authenticated;
grant select on table public.period_closure_observation_resolutions, public.accounting_period_close_runs
to authenticated;
grant select, insert, update on table public.accounting_period_close_runs to service_role;

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
  if actor_id is null or not public.is_current_user_admin() then raise exception 'ADMIN_MASTER_REQUIRED'; end if;
  if nullif(btrim(target_reason), '') is null or nullif(btrim(target_evidence), '') is null then
    raise exception 'RECTIFICATION_REASON_AND_EVIDENCE_REQUIRED';
  end if;
  if coalesce(target_result_adjustment_cents, 0) = 0 and coalesce(target_commission_adjustment_cents, 0) = 0 then
    raise exception 'RECTIFICATION_ADJUSTMENT_REQUIRED';
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
  rectified_trader := source_closure.trader_result_cents
    + target_result_adjustment_cents - target_commission_adjustment_cents;
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
    target_period_id, source_closure.id, adjustment_period_id,
    target_result_adjustment_cents, target_commission_adjustment_cents,
    btrim(target_reason), btrim(target_evidence), actor_id
  ) returning id into rectification_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
  ) values (
    actor_id, 'period_closure_versions', rectified_closure_id, 'rectify_period_close',
    to_jsonb(source_closure),
    jsonb_build_object(
      'closure_version_id', rectified_closure_id,
      'adjustment_period_id', adjustment_period_id,
      'result_adjustment_cents', target_result_adjustment_cents,
      'commission_adjustment_cents', target_commission_adjustment_cents,
      'evidence', btrim(target_evidence)
    ),
    btrim(target_reason)
  );

  return rectification_id;
end;
$$;

create or replace function public.admin_resolve_period_closure_observation(
  target_period_id uuid,
  target_resolution text,
  target_evidence text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_closure public.period_closure_versions%rowtype;
  resolution_id uuid;
begin
  if actor_id is null or not public.is_current_user_admin() then raise exception 'ADMIN_MASTER_REQUIRED'; end if;
  if nullif(btrim(target_resolution), '') is null or nullif(btrim(target_evidence), '') is null then
    raise exception 'RESOLUTION_AND_EVIDENCE_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_period_id::text, 2));
  select * into selected_closure
  from public.period_closure_versions
  where period_id = target_period_id
  order by version desc
  limit 1;

  if not found or selected_closure.closure_status <> 'closed_with_observations' then
    raise exception 'OBSERVED_CLOSURE_REQUIRED';
  end if;

  insert into public.period_closure_observation_resolutions(
    period_id, closure_version_id, resolution, evidence, resolved_by
  ) values (
    target_period_id, selected_closure.id, btrim(target_resolution), btrim(target_evidence), actor_id
  )
  on conflict (closure_version_id) do nothing
  returning id into resolution_id;

  if resolution_id is null then raise exception 'OBSERVATION_ALREADY_RESOLVED'; end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id, 'period_closure_observation_resolutions', resolution_id,
    'resolve_period_close_observation',
    jsonb_build_object(
      'period_id', target_period_id,
      'closure_version_id', selected_closure.id,
      'evidence', btrim(target_evidence)
    ),
    btrim(target_resolution)
  );

  return resolution_id;
end;
$$;

revoke all on function public.admin_record_period_rectification(uuid,bigint,bigint,text,text)
from public, anon;
grant execute on function public.admin_record_period_rectification(uuid,bigint,bigint,text,text)
to authenticated;

revoke all on function public.admin_resolve_period_closure_observation(uuid,text,text)
from public, anon;
grant execute on function public.admin_resolve_period_closure_observation(uuid,text,text)
to authenticated;

