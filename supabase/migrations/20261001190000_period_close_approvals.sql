begin;

create table public.period_closure_approvals (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete restrict,
  closure_version_id uuid not null references public.period_closure_versions(id) on delete restrict,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  unique (closure_version_id)
);

create table public.period_closure_dispatches (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete restrict,
  closure_version_id uuid not null references public.period_closure_versions(id) on delete restrict,
  approval_id uuid not null references public.period_closure_approvals(id) on delete restrict,
  recipient_email text not null,
  sender_email text not null default 'noreply@nodaltrading.com',
  subject text not null,
  delivery_status text not null default 'awaiting_documents',
  created_at timestamptz not null default now(),
  queued_at timestamptz,
  sent_at timestamptz,
  failure_message text,
  unique (closure_version_id),
  constraint period_closure_dispatch_recipient_present check (nullif(btrim(recipient_email), '') is not null),
  constraint period_closure_dispatch_sender_present check (nullif(btrim(sender_email), '') is not null),
  constraint period_closure_dispatch_subject_present check (nullif(btrim(subject), '') is not null),
  constraint period_closure_dispatch_status_valid check (
    delivery_status in ('awaiting_documents', 'queued', 'sending', 'sent', 'failed')
  ),
  constraint period_closure_dispatch_sent_consistent check (
    (delivery_status = 'sent' and sent_at is not null)
    or (delivery_status <> 'sent' and sent_at is null)
  )
);

create index period_closure_approvals_period_idx
on public.period_closure_approvals(period_id, approved_at desc);

create index period_closure_dispatches_status_idx
on public.period_closure_dispatches(delivery_status, created_at);

alter table public.period_closure_approvals enable row level security;
alter table public.period_closure_dispatches enable row level security;

create policy period_closure_approvals_read_allowed
on public.period_closure_approvals for select to authenticated
using (public.is_current_user_admin() or public.can_access_period(period_id));

create policy period_closure_dispatches_read_admin
on public.period_closure_dispatches for select to authenticated
using (public.is_current_user_admin());

revoke all on table public.period_closure_approvals, public.period_closure_dispatches
from public, anon;
revoke insert, update, delete on table public.period_closure_approvals, public.period_closure_dispatches
from authenticated;
grant select on table public.period_closure_approvals, public.period_closure_dispatches
to authenticated;

create or replace function public.admin_approve_period_closure(target_period_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_closure public.period_closure_versions%rowtype;
  selected_period public.periods%rowtype;
  recipient text;
  approval_id uuid;
begin
  if actor_id is null or not public.is_current_user_admin() then
    raise exception 'ADMIN_MASTER_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_period_id::text, 3));

  select * into selected_period
  from public.periods
  where id = target_period_id;
  if not found or selected_period.lifecycle_status not in ('closed', 'closed_with_observations') then
    raise exception 'CLOSED_PERIOD_REQUIRED';
  end if;

  select * into selected_closure
  from public.period_closure_versions
  where period_id = target_period_id
  order by version desc
  limit 1;
  if not found then raise exception 'CLOSURE_NOT_FOUND'; end if;

  if selected_closure.closure_status = 'closed_with_observations'
    and not exists (
      select 1
      from public.period_closure_observation_resolutions resolutions
      where resolutions.closure_version_id = selected_closure.id
    ) then
    raise exception 'UNRESOLVED_OBSERVATIONS';
  end if;

  select approvals.id into approval_id
  from public.period_closure_approvals approvals
  where approvals.closure_version_id = selected_closure.id;
  if approval_id is not null then return approval_id; end if;

  select lower(users.email) into recipient
  from public.workspaces workspaces
  join public.nodal_users users on users.id = workspaces.owner_user_id
  where workspaces.id = selected_period.workspace_id;
  if nullif(btrim(recipient), '') is null then raise exception 'RECIPIENT_EMAIL_REQUIRED'; end if;

  insert into public.period_closure_approvals(
    period_id, closure_version_id, approved_by
  ) values (
    target_period_id, selected_closure.id, actor_id
  ) returning id into approval_id;

  insert into public.period_closure_dispatches(
    period_id, closure_version_id, approval_id,
    recipient_email, sender_email, subject, delivery_status
  ) values (
    target_period_id, selected_closure.id, approval_id,
    recipient, 'noreply@nodaltrading.com',
    'Cierre período ' || to_char(selected_period.period_month, 'YYYY-MM'),
    'awaiting_documents'
  );

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id, 'period_closure_approvals', approval_id, 'approve_period_close',
    jsonb_build_object(
      'period_id', target_period_id,
      'closure_version_id', selected_closure.id,
      'closure_version', selected_closure.version,
      'recipient_email', recipient,
      'sender_email', 'noreply@nodaltrading.com'
    ),
    'Cierre revisado y aprobado por Admin Master'
  );

  return approval_id;
end;
$$;

revoke all on function public.admin_approve_period_closure(uuid) from public, anon;
grant execute on function public.admin_approve_period_closure(uuid) to authenticated;

comment on table public.period_closure_approvals is
  'Aprobación explícita de Admin Master sobre una versión inmutable de cierre.';
comment on table public.period_closure_dispatches is
  'Cola auditable del correo de cierre. La aprobación crea el envío en espera hasta que existan informe PDF y factura.';

commit;
