-- Informes PDF inmutables por version de cierre. Se generan al cerrar el
-- periodo y quedan disponibles solo para revision de Admin Master hasta que la
-- version sea aprobada y el despacho documental este completo.

create table if not exists public.period_closure_reports (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete restrict,
  closure_version_id uuid not null references public.period_closure_versions(id) on delete restrict,
  owner_user_id uuid not null references public.nodal_users(id) on delete restrict,
  report_status text not null default 'generating',
  snapshot_data jsonb not null,
  storage_bucket text not null default 'period-close-reports',
  storage_path text,
  checksum_sha256 text,
  generated_at timestamptz,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (closure_version_id),
  constraint period_closure_report_status_valid check (
    report_status in ('generating', 'ready', 'failed')
  ),
  constraint period_closure_report_ready_consistent check (
    (report_status = 'ready' and storage_path is not null and generated_at is not null and failure_message is null)
    or report_status <> 'ready'
  ),
  constraint period_closure_report_failure_consistent check (
    (report_status = 'failed' and nullif(btrim(failure_message), '') is not null)
    or report_status <> 'failed'
  )
);

create index if not exists period_closure_reports_period_idx
on public.period_closure_reports(period_id, created_at desc);

create index if not exists period_closure_reports_status_idx
on public.period_closure_reports(report_status, updated_at);

drop trigger if exists period_closure_reports_set_updated_at on public.period_closure_reports;
create trigger period_closure_reports_set_updated_at
before update on public.period_closure_reports
for each row execute function public.set_updated_at();

alter table public.period_closure_reports enable row level security;

drop policy if exists period_closure_reports_admin_read on public.period_closure_reports;
create policy period_closure_reports_admin_read
on public.period_closure_reports for select to authenticated
using (public.is_current_user_admin());

revoke all on table public.period_closure_reports from public, anon;
revoke insert, update, delete on table public.period_closure_reports from authenticated;
grant select on table public.period_closure_reports to authenticated;
grant select, insert, update on table public.period_closure_reports to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'period-close-reports',
  'period-close-reports',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.require_ready_period_closure_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.period_closure_reports reports
    where reports.closure_version_id = new.closure_version_id
      and reports.report_status = 'ready'
  ) then
    raise exception 'REPORT_NOT_READY';
  end if;
  return new;
end;
$$;

drop trigger if exists period_closure_approvals_require_report on public.period_closure_approvals;
create trigger period_closure_approvals_require_report
before insert on public.period_closure_approvals
for each row execute function public.require_ready_period_closure_report();

revoke all on function public.require_ready_period_closure_report()
from public, anon, authenticated;

comment on table public.period_closure_reports is
  'PDF individual de cierre y fotografia detallada congelada para cada version. No se expone como descarga al usuario.';
