-- Provision inicial de espacios y periodos de prueba.
-- No define el futuro procedimiento contable de apertura o cierre mensual.

create table public.workspace_provisioning_events (
  id bigint generated always as identity primary key,
  target_user_id uuid not null references public.nodal_users (id) on delete restrict,
  period_month date not null,
  created_workspaces integer not null,
  created_periods integer not null,
  performed_by text not null,
  reason text not null,
  occurred_at timestamptz not null default now(),
  constraint workspace_provisioning_period_starts_on_day_one check (
    period_month = date_trunc('month', period_month)::date
  ),
  constraint workspace_provisioning_counts_nonnegative check (
    created_workspaces >= 0 and created_periods >= 0
  ),
  constraint workspace_provisioning_reason_present check (btrim(reason) <> '')
);

alter table public.workspace_provisioning_events enable row level security;
revoke all on table public.workspace_provisioning_events from anon, authenticated;
grant select on table public.workspace_provisioning_events to service_role;

create function public.provision_nodal_user_foundation(
  target_email text,
  target_period_month date,
  provisioning_reason text
)
returns table (created_workspaces integer, created_periods integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(target_email));
  target_user_id uuid;
  inserted_workspaces integer := 0;
  inserted_periods integer := 0;
  operation_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    session_user
  );
begin
  if normalized_email = '' or btrim(provisioning_reason) = '' then
    raise exception 'Email and provisioning reason are required';
  end if;

  if target_period_month is null
    or target_period_month <> date_trunc('month', target_period_month)::date then
    raise exception 'The period must use the first day of its month';
  end if;

  select users.id
  into target_user_id
  from public.nodal_users as users
  where users.email = normalized_email
    and users.access_state = 'active';

  if not found then
    raise exception 'No active NODAL user exists for the supplied email';
  end if;

  insert into public.workspaces (owner_user_id, modality)
  values
    (target_user_id, 'real'),
    (target_user_id, 'practice')
  on conflict (owner_user_id, modality) do nothing;
  get diagnostics inserted_workspaces = row_count;

  insert into public.periods (workspace_id, period_month)
  select spaces.id, target_period_month
  from public.workspaces as spaces
  where spaces.owner_user_id = target_user_id
    and spaces.modality in ('real', 'practice')
  on conflict (workspace_id, period_month) do nothing;
  get diagnostics inserted_periods = row_count;

  if inserted_workspaces > 0 or inserted_periods > 0 then
    insert into public.workspace_provisioning_events (
      target_user_id,
      period_month,
      created_workspaces,
      created_periods,
      performed_by,
      reason
    )
    values (
      target_user_id,
      target_period_month,
      inserted_workspaces,
      inserted_periods,
      operation_role,
      btrim(provisioning_reason)
    );
  end if;

  return query select inserted_workspaces, inserted_periods;
end;
$$;

revoke all on function public.provision_nodal_user_foundation(text, date, text)
from public, anon, authenticated;
grant execute on function public.provision_nodal_user_foundation(text, date, text)
to service_role;
