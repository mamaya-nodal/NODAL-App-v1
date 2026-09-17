-- Las coberturas detectadas sin telemetría prop pueden asociarse a cuentas
-- cargadas manualmente. La asociación reutiliza un Control Diario existente
-- cuando ya se registró la misma operación y, si no existe, lo crea una sola vez.

create table public.ninja_operation_batch_manual_accounts (
  batch_id uuid not null references public.ninja_operation_batches(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  allocated_broker_result_cents bigint not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (batch_id, account_id)
);

alter table public.ninja_operation_batch_manual_accounts enable row level security;
revoke all on table public.ninja_operation_batch_manual_accounts from public, anon, authenticated;

comment on table public.ninja_operation_batch_manual_accounts is
  'Asignación auditada de una cobertura Ninja a cuentas prop sin telemetría en el conector vinculado.';

create or replace function public.assign_nodal_manual_accounts_to_ninja_batch(
  target_batch_id uuid,
  target_account_ids uuid[],
  target_close_accounts boolean default false
)
returns table (
  daily_control_id uuid,
  reused_existing_control boolean,
  assigned_account_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_batch public.ninja_operation_batches%rowtype;
  broker_session public.ninja_operation_probe_sessions%rowtype;
  participant_ids uuid[];
  replica_ids uuid[];
  selected_period_id uuid;
  selected_company_id uuid;
  selected_phase public.operation_phase;
  selected_leader_id uuid;
  selected_control_id uuid;
  matching_control_ids uuid[];
  prior_control public.daily_controls%rowtype;
  control_result record;
  source_key text;
  target_balance bigint;
  received_balance bigint;
  distributed bigint;
  sync_reason text;
  candidate_phase_count integer;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;

  participant_ids := array(
    select distinct account_id
    from unnest(coalesce(target_account_ids, array[]::uuid[])) as selected(account_id)
    where account_id is not null
    order by account_id
  );
  if cardinality(participant_ids) < 1 or cardinality(participant_ids) > 250 then
    raise exception 'Select between one and 250 accounts';
  end if;

  select batches.* into selected_batch
  from public.ninja_operation_batches batches
  join public.ninja_connectors connectors on connectors.id = batches.connector_id
  where batches.id = target_batch_id
    and connectors.owner_user_id = actor_id
    and connectors.status = 'active'
  for update of batches;
  if not found then raise exception 'Coverage batch is not available'; end if;

  if selected_batch.accounting_status = 'committed' and selected_batch.daily_control_id is not null then
    return query select selected_batch.daily_control_id, true, cardinality(participant_ids);
    return;
  end if;
  if selected_batch.accounting_status <> 'blocked' or selected_batch.status <> 'unmatched' then
    raise exception 'Only unmatched blocked coverages can be assigned manually';
  end if;

  select sessions.* into broker_session
  from public.ninja_operation_probe_sessions sessions
  where sessions.id = selected_batch.broker_session_id
    and sessions.status = 'closed';
  if not found or broker_session.closing_balance is null then
    raise exception 'The broker coverage is not closed';
  end if;

  if (
    select count(*)
    from public.accounts accounts
    join public.periods periods on periods.id = accounts.period_id
    join public.workspaces spaces on spaces.id = periods.workspace_id
    where accounts.id = any(participant_ids)
      and spaces.owner_user_id = actor_id
      and not exists (
        select 1 from public.ninja_account_links links
        where links.account_id = accounts.id and links.closed_at is null
      )
  ) <> cardinality(participant_ids) then
    raise exception 'Every selected account must be a manual account owned by the user';
  end if;

  select accounts.period_id, accounts.company_id
  into selected_period_id, selected_company_id
  from public.accounts accounts
  where accounts.id = participant_ids[1];

  if exists (
    select 1 from public.accounts accounts
    where accounts.id = any(participant_ids)
      and (accounts.period_id <> selected_period_id or accounts.company_id <> selected_company_id)
  ) then
    raise exception 'All selected accounts must belong to the same company and period';
  end if;

  select accounts.id into selected_leader_id
  from public.accounts accounts
  where accounts.id = any(participant_ids)
  order by accounts.reference_number, accounts.id
  limit 1;
  replica_ids := array(
    select accounts.id
    from public.accounts accounts
    where accounts.id = any(participant_ids) and accounts.id <> selected_leader_id
    order by accounts.reference_number, accounts.id
  );

  select count(distinct phases.phase)::integer into candidate_phase_count
  from (
    select coalesce((
      select entries.phase
      from public.operation_entries entries
      where entries.account_id = accounts.id
      order by entries.operated_on desc, entries.created_at desc
      limit 1
    ), 'Evaluacion'::public.operation_phase) as phase
    from public.accounts accounts
    where accounts.id = any(participant_ids)
  ) phases;
  if candidate_phase_count <> 1 then
    raise exception 'Selected accounts are in different phases';
  end if;
  select coalesce((
    select entries.phase
    from public.operation_entries entries
    where entries.account_id = selected_leader_id
    order by entries.operated_on desc, entries.created_at desc
    limit 1
  ), 'Evaluacion'::public.operation_phase) into selected_phase;

  select coalesce(array_agg(candidate.id order by candidate.id), array[]::uuid[])
  into matching_control_ids
  from (
    select controls.id
    from public.daily_controls controls
    where controls.period_id = selected_period_id
      and controls.kind = 'balance_update'
      and controls.operating_result_cents = selected_batch.broker_result_cents
      and not exists (
        select 1 from public.ninja_operation_batches other
        where other.daily_control_id = controls.id and other.id <> selected_batch.id
      )
      and (
        select array_agg(participants.account_id order by participants.account_id)
        from public.daily_control_participants participants
        where participants.daily_control_id = controls.id
      ) = participant_ids
  ) candidate;

  if cardinality(matching_control_ids) > 1 then
    raise exception 'More than one existing control matches this coverage';
  end if;

  if cardinality(matching_control_ids) = 1 then
    selected_control_id := matching_control_ids[1];
    select controls.phase into selected_phase
    from public.daily_controls controls where controls.id = selected_control_id;
    reused_existing_control := true;
  else
    select controls.* into prior_control
    from public.daily_controls controls
    where controls.period_id = selected_period_id
    order by controls.control_number desc
    limit 1
    for update;
    if not found or prior_control.balance_after_cents is null then
      raise exception 'The period has no broker opening balance';
    end if;
    if selected_batch.operated_on < prior_control.operated_on then
      raise exception 'An older coverage requires the controlled correction flow';
    end if;

    target_balance := prior_control.balance_after_cents + selected_batch.broker_result_cents;
    if target_balance < 0 then raise exception 'Coverage would leave a negative broker balance'; end if;
    received_balance := round(broker_session.closing_balance * 100)::bigint;
    sync_reason := case when received_balance <> target_balance
      then 'Cobertura asignada manualmente a cuentas operadas fuera del conector vinculado.'
      else null end;
    source_key := 'ninja-operation:' || broker_session.opening_event_id::text;

    select * into control_result
    from public.confirm_nodal_daily_control(
      target_period_id => selected_period_id,
      target_kind => 'balance_update',
      target_operated_on => selected_batch.operated_on,
      target_confirmation_key => selected_batch.id,
      target_balance_cents => target_balance,
      target_company_id => selected_company_id,
      target_leader_account_id => selected_leader_id,
      target_replica_account_ids => replica_ids,
      target_phase => selected_phase,
      target_observations => 'Cobertura Ninja asignada manualmente a cuentas prop sin telemetría.',
      target_source => 'ninjatrader',
      target_source_event_key => source_key,
      target_received_balance_cents => received_balance,
      target_sync_issue_reason => sync_reason
    );
    selected_control_id := control_result.daily_control_id;
    reused_existing_control := false;
  end if;

  delete from public.ninja_operation_batch_manual_accounts assignments
  where assignments.batch_id = selected_batch.id;
  insert into public.ninja_operation_batch_manual_accounts(
    batch_id, account_id, allocated_broker_result_cents, created_by
  )
  select selected_batch.id, participants.account_id,
    participants.allocated_result_cents, actor_id
  from public.daily_control_participants participants
  where participants.daily_control_id = selected_control_id
    and participants.account_id = any(participant_ids);

  select coalesce(sum(assignments.allocated_broker_result_cents), 0)
  into distributed
  from public.ninja_operation_batch_manual_accounts assignments
  where assignments.batch_id = selected_batch.id;

  update public.ninja_operation_batches batches
  set status = 'ready', accounting_mode = 'active', accounting_status = 'committed',
    accounting_blocking_reason = null, accounting_period_id = selected_period_id,
    accounting_company_id = selected_company_id, accounting_phase = selected_phase,
    operated_on = (select controls.operated_on from public.daily_controls controls where controls.id = selected_control_id),
    daily_control_id = selected_control_id, distributed_cents = distributed,
    rounding_difference_cents = selected_batch.broker_result_cents - distributed,
    updated_at = now()
  where batches.id = selected_batch.id;

  update public.ninja_broker_balance_events events
  set status = 'confirmed', daily_control_id = selected_control_id,
    resolved_at = coalesce(events.resolved_at, now())
  where events.connector_id = selected_batch.connector_id
    and events.source_event_id = 'ninja-operation:' || broker_session.opening_event_id::text;

  if target_close_accounts then
    update public.accounts accounts
    set state = 'closed', state_origin = 'manual_closed'
    where accounts.id = any(participant_ids);
  end if;

  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values (
    actor_id, 'ninja_operation_batches', selected_batch.id,
    'ninja_coverage_manually_assigned',
    jsonb_build_object(
      'account_ids', participant_ids,
      'daily_control_id', selected_control_id,
      'reused_existing_control', reused_existing_control,
      'close_accounts', target_close_accounts,
      'broker_result_cents', selected_batch.broker_result_cents,
      'distributed_cents', distributed
    ),
    'Cobertura vinculada manualmente a cuentas prop operadas fuera del conector.'
  );

  return query select selected_control_id, reused_existing_control, cardinality(participant_ids);
end;
$$;

revoke all on function public.assign_nodal_manual_accounts_to_ninja_batch(uuid, uuid[], boolean)
from public, anon;
grant execute on function public.assign_nodal_manual_accounts_to_ninja_batch(uuid, uuid[], boolean)
to authenticated;

create or replace function public.get_current_user_ninja_operation_batches(target_limit integer default 30)
returns table (
  id uuid,
  opened_at timestamptz,
  settled_at timestamptz,
  correlation_status text,
  accounting_mode text,
  accounting_status text,
  blocking_reason text,
  operated_on date,
  broker_result_cents bigint,
  rounding_difference_cents bigint,
  company_name text,
  phase text,
  prop_accounts jsonb
)
language sql
security definer
set search_path = ''
stable
as $$
  select batches.id, batches.opened_at, batches.settled_at,
    batches.status, batches.accounting_mode, batches.accounting_status,
    batches.accounting_blocking_reason, batches.operated_on,
    batches.broker_result_cents, batches.rounding_difference_cents,
    companies.display_name, batches.accounting_phase::text,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'accountId', members.account_id,
        'accountName', members.account_name,
        'allocatedBrokerResultInCents', members.allocated_cents
      ) order by members.account_name)
      from (
        select technical.account_id, sessions.account_name,
          technical.allocated_broker_result_cents as allocated_cents
        from public.ninja_operation_batch_members technical
        join public.ninja_operation_probe_sessions sessions on sessions.id = technical.session_id
        where technical.batch_id = batches.id and technical.role = 'prop'
        union all
        select manual.account_id,
          company.display_name || ' · Cuenta ' || accounts.reference_number::text,
          manual.allocated_broker_result_cents
        from public.ninja_operation_batch_manual_accounts manual
        join public.accounts accounts on accounts.id = manual.account_id
        join public.companies company on company.id = accounts.company_id
        where manual.batch_id = batches.id
      ) members
    ), '[]'::jsonb)
  from public.ninja_operation_batches batches
  join public.ninja_connectors connectors on connectors.id = batches.connector_id
  left join public.companies companies on companies.id = batches.accounting_company_id
  where connectors.owner_user_id = (select auth.uid())
    and connectors.status = 'active'
  order by batches.opened_at desc, batches.id desc
  limit least(greatest(coalesce(target_limit, 30), 1), 100);
$$;

revoke all on function public.get_current_user_ninja_operation_batches(integer) from public, anon;
grant execute on function public.get_current_user_ninja_operation_batches(integer) to authenticated;
