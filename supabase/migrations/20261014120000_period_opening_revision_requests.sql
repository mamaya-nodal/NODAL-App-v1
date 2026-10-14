-- Edicion auditada del punto de partida: el titular solicita permiso, Admin
-- Master decide y una aprobacion permite reemplazar una sola vez la apertura
-- mientras el periodo no tenga actividad economica posterior.

alter table public.period_opening_snapshots
  add column if not exists revision_number integer not null default 1,
  add column if not exists updated_by uuid references auth.users(id) on delete restrict,
  add column if not exists updated_at timestamptz not null default now(),
  add constraint period_opening_revision_number_positive check (revision_number > 0);

create table public.period_opening_revision_requests (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete restrict,
  opening_snapshot_id uuid not null references public.period_opening_snapshots(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text,
  consumed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint opening_revision_request_status_valid check (
    status in ('pending', 'approved', 'rejected', 'consumed')
  ),
  constraint opening_revision_request_review_consistent check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint opening_revision_request_consumed_consistent check (
    (status = 'consumed' and consumed_at is not null)
    or (status <> 'consumed' and consumed_at is null)
  )
);

create unique index period_opening_revision_requests_one_active_idx
on public.period_opening_revision_requests(period_id)
where status in ('pending', 'approved');

create index period_opening_revision_requests_status_idx
on public.period_opening_revision_requests(status, requested_at);

create table public.period_opening_revision_history (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete restrict,
  opening_snapshot_id uuid not null references public.period_opening_snapshots(id) on delete restrict,
  request_id uuid not null unique references public.period_opening_revision_requests(id) on delete restrict,
  revision_number integer not null,
  previous_data jsonb not null,
  current_data jsonb not null,
  revised_by uuid not null references auth.users(id) on delete restrict,
  revised_at timestamptz not null default now(),
  constraint period_opening_revision_history_number_positive check (revision_number > 1)
);

alter table public.period_opening_revision_requests enable row level security;
alter table public.period_opening_revision_history enable row level security;

create policy period_opening_revision_requests_read
on public.period_opening_revision_requests for select to authenticated
using (
  requested_by = auth.uid()
  or public.is_current_user_admin()
);

create policy period_opening_revision_history_read
on public.period_opening_revision_history for select to authenticated
using (
  public.can_access_period(period_id)
  or public.is_current_user_admin()
);

revoke all on table public.period_opening_revision_requests,
  public.period_opening_revision_history from public, anon;
revoke insert, update, delete on table public.period_opening_revision_requests,
  public.period_opening_revision_history from authenticated;
grant select on table public.period_opening_revision_requests,
  public.period_opening_revision_history to authenticated;

create trigger period_opening_revision_requests_set_updated_at
before update on public.period_opening_revision_requests
for each row execute function public.set_updated_at();

create or replace function public.nodal_period_opening_has_activity(target_period_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists(select 1 from public.accounts where period_id = target_period_id)
    or exists(select 1 from public.daily_controls where period_id = target_period_id)
    or exists(select 1 from public.operation_entries where period_id = target_period_id)
    or exists(select 1 from public.wallet_movements where period_id = target_period_id)
    or exists(select 1 from public.funding_withdrawals where period_id = target_period_id)
    or exists(select 1 from public.account_phase_withdrawals where period_id = target_period_id)
    or exists(select 1 from public.account_period_carryovers where to_period_id = target_period_id)
    or exists(select 1 from public.period_closure_versions where period_id = target_period_id)
    or exists(select 1 from public.period_rectifications where adjustment_period_id = target_period_id);
$$;

revoke all on function public.nodal_period_opening_has_activity(uuid)
from public, anon, authenticated;

create or replace function public.request_nodal_period_opening_revision(target_period_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  snapshot_id uuid;
  request_id uuid;
begin
  if actor_id is null then raise exception 'OPENING_REVISION_SESSION_REQUIRED'; end if;

  select snapshots.id
  into snapshot_id
  from public.period_opening_snapshots snapshots
  join public.periods periods on periods.id = snapshots.period_id
  join public.workspaces spaces on spaces.id = periods.workspace_id
  where snapshots.period_id = target_period_id
    and spaces.owner_user_id = actor_id
    and spaces.modality = 'real'
    and periods.lifecycle_status = 'open'
  for update of snapshots;

  if snapshot_id is null then raise exception 'OPENING_REVISION_NOT_AVAILABLE'; end if;
  if public.nodal_period_opening_has_activity(target_period_id) then
    raise exception 'OPENING_REVISION_HAS_ACTIVITY';
  end if;

  select requests.id
  into request_id
  from public.period_opening_revision_requests requests
  where requests.period_id = target_period_id
    and requests.status in ('pending', 'approved')
  order by requests.requested_at desc
  limit 1;

  if request_id is not null then return request_id; end if;

  insert into public.period_opening_revision_requests(
    period_id, opening_snapshot_id, requested_by
  ) values (
    target_period_id, snapshot_id, actor_id
  ) returning id into request_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id,
    'period_opening_revision_requests',
    request_id,
    'period_opening_revision_requested',
    jsonb_build_object(
      'period_id', target_period_id,
      'opening_snapshot_id', snapshot_id,
      'status', 'pending'
    ),
    'El titular solicito rehacer su punto de partida'
  );

  return request_id;
end;
$$;

revoke all on function public.request_nodal_period_opening_revision(uuid)
from public, anon;
grant execute on function public.request_nodal_period_opening_revision(uuid)
to authenticated;

create or replace function public.admin_review_period_opening_revision_request(
  target_request_id uuid,
  target_approved boolean,
  management_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_request public.period_opening_revision_requests%rowtype;
  next_status text := case when target_approved then 'approved' else 'rejected' end;
begin
  if actor_id is null or not public.is_current_user_admin() then
    raise exception 'ADMIN_MASTER_REQUIRED';
  end if;
  if nullif(btrim(management_reason), '') is null then
    raise exception 'OPENING_REVISION_REASON_REQUIRED';
  end if;

  select * into selected_request
  from public.period_opening_revision_requests
  where id = target_request_id
  for update;

  if selected_request.id is null or selected_request.status <> 'pending' then
    raise exception 'OPENING_REVISION_REQUEST_NOT_PENDING';
  end if;
  if target_approved and public.nodal_period_opening_has_activity(selected_request.period_id) then
    raise exception 'OPENING_REVISION_HAS_ACTIVITY';
  end if;

  update public.period_opening_revision_requests
  set status = next_status,
      reviewed_by = actor_id,
      reviewed_at = now(),
      review_reason = btrim(management_reason)
  where id = selected_request.id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
  ) values (
    actor_id,
    'period_opening_revision_requests',
    selected_request.id,
    case when target_approved
      then 'period_opening_revision_approved'
      else 'period_opening_revision_rejected'
    end,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', next_status, 'period_id', selected_request.period_id),
    btrim(management_reason)
  );
end;
$$;

revoke all on function public.admin_review_period_opening_revision_request(uuid,boolean,text)
from public, anon;
grant execute on function public.admin_review_period_opening_revision_request(uuid,boolean,text)
to authenticated;

create or replace function public.revise_nodal_period_opening(
  target_period_id uuid,
  target_start_mode text,
  target_cutover_date date,
  target_broker_balance_cents bigint,
  target_funding_pending_cents bigint,
  target_contributed_capital_cents bigint,
  target_personal_withdrawals_cents bigint,
  target_floating_cents bigint,
  target_virgin_accounts integer,
  target_live_evaluation_accounts integer,
  target_funded_accounts integer,
  target_closed_accounts_reference integer,
  target_batches jsonb default '[]'::jsonb,
  target_wallets jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_month date;
  selected_workspace_id uuid;
  snapshot_id uuid;
  next_revision integer;
  request_id uuid;
  batch jsonb;
  wallet jsonb;
  wallet_id uuid;
  old_wallet_ids uuid[] := '{}'::uuid[];
  wallet_total bigint := 0;
  stored_contributed bigint;
  inferred_result bigint;
  previous_snapshot jsonb;
  previous_batches jsonb;
  previous_wallets jsonb;
  current_snapshot jsonb;
  current_batches jsonb;
  current_wallets jsonb;
begin
  if actor_id is null or not public.can_access_period(target_period_id) then
    raise exception 'OPENING_REVISION_NOT_AVAILABLE';
  end if;

  select periods.period_month, periods.workspace_id, snapshots.id,
    snapshots.revision_number + 1, to_jsonb(snapshots)
  into selected_month, selected_workspace_id, snapshot_id,
    next_revision, previous_snapshot
  from public.period_opening_snapshots snapshots
  join public.periods periods on periods.id = snapshots.period_id
  join public.workspaces spaces on spaces.id = periods.workspace_id
  where snapshots.period_id = target_period_id
    and spaces.owner_user_id = actor_id
    and spaces.modality = 'real'
    and periods.lifecycle_status = 'open'
  for update of snapshots;

  if snapshot_id is null then raise exception 'OPENING_REVISION_NOT_AVAILABLE'; end if;

  select requests.id into request_id
  from public.period_opening_revision_requests requests
  where requests.period_id = target_period_id
    and requests.opening_snapshot_id = snapshot_id
    and requests.requested_by = actor_id
    and requests.status = 'approved'
  order by requests.reviewed_at desc
  limit 1
  for update;

  if request_id is null then raise exception 'OPENING_REVISION_NOT_APPROVED'; end if;
  if public.nodal_period_opening_has_activity(target_period_id) then
    raise exception 'OPENING_REVISION_HAS_ACTIVITY';
  end if;

  if target_start_mode not in ('zero', 'reconstruct')
    or target_cutover_date is null
    or date_trunc('month', target_cutover_date)::date <> selected_month then
    raise exception 'opening date or mode is invalid';
  end if;
  if target_broker_balance_cents is null or target_broker_balance_cents < 0
    or target_funding_pending_cents < 0 or target_contributed_capital_cents < 0
    or target_personal_withdrawals_cents < 0 or target_floating_cents < 0
    or target_virgin_accounts < 0 or target_live_evaluation_accounts < 0
    or target_funded_accounts < 0 or target_closed_accounts_reference < 0 then
    raise exception 'opening values are invalid';
  end if;
  if target_batches is null or jsonb_typeof(target_batches) <> 'array'
    or target_wallets is null or jsonb_typeof(target_wallets) <> 'array' then
    raise exception 'opening collections are invalid';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(target_wallets) wallet_value
    group by lower(btrim(wallet_value ->> 'name'))
    having count(*) > 1
  ) then raise exception 'wallet names must be unique'; end if;

  for wallet in select value from jsonb_array_elements(target_wallets)
  loop
    if nullif(btrim(wallet ->> 'name'), '') is null
      or coalesce((wallet ->> 'balanceInCents')::bigint, -1) < 0 then
      raise exception 'opening wallet is invalid';
    end if;
    wallet_total := wallet_total + (wallet ->> 'balanceInCents')::bigint;
  end loop;

  stored_contributed := case when target_start_mode = 'zero'
    then target_broker_balance_cents
    else target_contributed_capital_cents end;
  inferred_result := target_broker_balance_cents + wallet_total + target_funding_pending_cents
    - case when target_start_mode = 'zero'
        then stored_contributed + wallet_total
        else stored_contributed - target_personal_withdrawals_cents
      end;

  select coalesce(jsonb_agg(to_jsonb(batches) order by batches.created_at, batches.id), '[]'::jsonb)
  into previous_batches
  from public.period_opening_account_batches batches
  where batches.opening_snapshot_id = snapshot_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', opening_wallets.id,
    'wallet_id', opening_wallets.wallet_id,
    'name', wallets.name,
    'balance_cents', opening_wallets.balance_cents,
    'created_at', opening_wallets.created_at
  ) order by wallets.name, opening_wallets.id), '[]'::jsonb),
  coalesce(array_agg(opening_wallets.wallet_id), '{}'::uuid[])
  into previous_wallets, old_wallet_ids
  from public.period_opening_wallets opening_wallets
  join public.nodal_wallets wallets on wallets.id = opening_wallets.wallet_id
  where opening_wallets.opening_snapshot_id = snapshot_id;

  delete from public.period_opening_account_batches where opening_snapshot_id = snapshot_id;
  delete from public.period_opening_wallets where opening_snapshot_id = snapshot_id;

  update public.period_opening_snapshots
  set start_mode = target_start_mode,
      cutover_date = target_cutover_date,
      broker_balance_cents = target_broker_balance_cents,
      wallet_balance_cents = wallet_total,
      funding_pending_cents = target_funding_pending_cents,
      contributed_capital_cents = stored_contributed,
      personal_withdrawals_cents = target_personal_withdrawals_cents,
      prior_realized_result_cents = inferred_result,
      floating_cents = target_floating_cents,
      virgin_accounts = target_virgin_accounts,
      live_evaluation_accounts = target_live_evaluation_accounts,
      funded_accounts = target_funded_accounts,
      closed_accounts_reference = target_closed_accounts_reference,
      revision_number = next_revision,
      updated_by = actor_id,
      updated_at = now()
  where id = snapshot_id;

  for wallet in select value from jsonb_array_elements(target_wallets)
  loop
    insert into public.nodal_wallets(workspace_id, name, created_by, updated_by)
    values(selected_workspace_id, btrim(wallet ->> 'name'), actor_id, actor_id)
    on conflict (workspace_id, name) do update set
      is_active = true,
      updated_by = actor_id,
      updated_at = now()
    returning id into wallet_id;

    insert into public.period_opening_wallets(opening_snapshot_id, wallet_id, balance_cents)
    values(snapshot_id, wallet_id, (wallet ->> 'balanceInCents')::bigint);
  end loop;

  for batch in select value from jsonb_array_elements(target_batches)
  loop
    insert into public.period_opening_account_batches(
      opening_snapshot_id, company_name, account_size_cents, stage, account_count,
      cost_per_account_cents, current_cash_value_cents
    ) values (
      snapshot_id, btrim(batch ->> 'companyName'),
      (batch ->> 'accountSizeInCents')::bigint, batch ->> 'stage',
      (batch ->> 'accountCount')::integer,
      coalesce((batch ->> 'costPerAccountInCents')::bigint, 0),
      nullif(batch ->> 'currentCashValueInCents', '')::bigint
    );
  end loop;

  update public.nodal_wallets wallets
  set is_active = false,
      updated_by = actor_id,
      updated_at = now()
  where wallets.id = any(old_wallet_ids)
    and not exists (select 1 from public.period_opening_wallets opening_wallets where opening_wallets.wallet_id = wallets.id)
    and not exists (select 1 from public.wallet_movements movements where movements.wallet_id = wallets.id or movements.destination_wallet_id = wallets.id)
    and not exists (select 1 from public.purchases purchases where purchases.wallet_id = wallets.id)
    and not exists (select 1 from public.funding_withdrawals withdrawals where withdrawals.wallet_id = wallets.id)
    and not exists (select 1 from public.daily_controls controls where controls.wallet_id = wallets.id)
    and not exists (select 1 from public.nodal_wallet_sources sources where sources.wallet_id = wallets.id);

  select to_jsonb(snapshots) into current_snapshot
  from public.period_opening_snapshots snapshots where snapshots.id = snapshot_id;
  select coalesce(jsonb_agg(to_jsonb(batches) order by batches.created_at, batches.id), '[]'::jsonb)
  into current_batches
  from public.period_opening_account_batches batches
  where batches.opening_snapshot_id = snapshot_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', opening_wallets.id,
    'wallet_id', opening_wallets.wallet_id,
    'name', wallets.name,
    'balance_cents', opening_wallets.balance_cents,
    'created_at', opening_wallets.created_at
  ) order by wallets.name, opening_wallets.id), '[]'::jsonb)
  into current_wallets
  from public.period_opening_wallets opening_wallets
  join public.nodal_wallets wallets on wallets.id = opening_wallets.wallet_id
  where opening_wallets.opening_snapshot_id = snapshot_id;

  insert into public.period_opening_revision_history(
    period_id, opening_snapshot_id, request_id, revision_number,
    previous_data, current_data, revised_by
  ) values (
    target_period_id, snapshot_id, request_id, next_revision,
    previous_snapshot || jsonb_build_object('batches', previous_batches, 'wallets', previous_wallets),
    current_snapshot || jsonb_build_object('batches', current_batches, 'wallets', current_wallets),
    actor_id
  );

  update public.period_opening_revision_requests
  set status = 'consumed', consumed_at = now()
  where id = request_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
  ) values (
    actor_id,
    'period_opening_snapshots',
    snapshot_id,
    'period_opening_revised',
    previous_snapshot || jsonb_build_object('batches', previous_batches, 'wallets', previous_wallets),
    current_snapshot || jsonb_build_object('batches', current_batches, 'wallets', current_wallets),
    'Punto de partida reemplazado con autorizacion de Admin Master'
  );

  return snapshot_id;
end;
$$;

revoke all on function public.revise_nodal_period_opening(
  uuid,text,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,jsonb,jsonb
) from public, anon;
grant execute on function public.revise_nodal_period_opening(
  uuid,text,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,jsonb,jsonb
) to authenticated;

create or replace function public.confirm_nodal_period_opening_after_connector(
  target_period_id uuid,
  target_start_mode text,
  target_cutover_date date,
  target_broker_balance_cents bigint,
  target_funding_pending_cents bigint,
  target_contributed_capital_cents bigint,
  target_personal_withdrawals_cents bigint,
  target_floating_cents bigint,
  target_virgin_accounts integer,
  target_live_evaluation_accounts integer,
  target_funded_accounts integer,
  target_closed_accounts_reference integer,
  target_batches jsonb default '[]'::jsonb,
  target_wallets jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  provisional_control_ids uuid[] := '{}'::uuid[];
begin
  if actor_id is null or not public.can_access_period(target_period_id) then
    raise exception 'selected period is not accessible';
  end if;

  if exists(select 1 from public.period_opening_snapshots where period_id = target_period_id) then
    return public.revise_nodal_period_opening(
      target_period_id, target_start_mode, target_cutover_date,
      target_broker_balance_cents, target_funding_pending_cents,
      target_contributed_capital_cents, target_personal_withdrawals_cents,
      target_floating_cents, target_virgin_accounts,
      target_live_evaluation_accounts, target_funded_accounts,
      target_closed_accounts_reference, target_batches, target_wallets
    );
  end if;

  select coalesce(array_agg(controls.id), '{}'::uuid[])
  into provisional_control_ids
  from public.daily_controls controls
  where controls.period_id = target_period_id
    and controls.control_number = 1
    and controls.kind = 'deposit'
    and controls.origin_destination = 'Aporte trader'
    and controls.source = 'ninjatrader'
    and controls.source_event_key like 'ninja-balance:%';

  if cardinality(provisional_control_ids) > 1
    or exists (
      select 1 from public.daily_controls controls
      where controls.period_id = target_period_id
        and not (controls.id = any(provisional_control_ids))
    ) then
    raise exception 'opening cannot be confirmed after period activity exists';
  end if;

  if cardinality(provisional_control_ids) = 1 then
    delete from public.ninja_broker_balance_events
    where daily_control_id = any(provisional_control_ids);
    delete from public.daily_controls
    where id = any(provisional_control_ids);
  end if;

  return public.confirm_nodal_period_opening(
    target_period_id, target_start_mode, target_cutover_date,
    target_broker_balance_cents, target_funding_pending_cents,
    target_contributed_capital_cents, target_personal_withdrawals_cents,
    target_floating_cents, target_virgin_accounts,
    target_live_evaluation_accounts, target_funded_accounts,
    target_closed_accounts_reference, target_batches, target_wallets
  );
end;
$$;

revoke all on function public.confirm_nodal_period_opening_after_connector(
  uuid,text,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,jsonb,jsonb
) from public, anon;
grant execute on function public.confirm_nodal_period_opening_after_connector(
  uuid,text,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,jsonb,jsonb
) to authenticated;

comment on table public.period_opening_revision_requests is
  'Solicitudes del titular para reemplazar una apertura sin actividad, resueltas por Admin Master.';
comment on table public.period_opening_revision_history is
  'Versiones anterior y vigente de cada apertura reemplazada con autorizacion.';
