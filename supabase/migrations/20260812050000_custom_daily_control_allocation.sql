-- Distribución excepcional por cuenta, validada y auditada en una transacción.

alter table public.daily_controls
add column allocation_reason text;

alter table public.daily_controls
add constraint daily_controls_allocation_reason_present
check (allocation_reason is null or btrim(allocation_reason) <> '');

create function public.block_implicit_custom_allocation_rewrite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.daily_controls as controls
    where controls.id = old.daily_control_id
      and controls.allocation_reason is not null
  ) then
    raise exception 'Custom allocations require an explicit redistribution';
  end if;
  return new;
end;
$$;

create trigger daily_control_participants_protect_custom_allocation
before update on public.daily_control_participants
for each row execute function public.block_implicit_custom_allocation_rewrite();

revoke all on function public.block_implicit_custom_allocation_rewrite()
from public, anon, authenticated;

create function public.confirm_nodal_daily_control_custom_allocation(
  target_period_id uuid,
  target_operated_on date,
  target_confirmation_key uuid,
  target_balance_cents bigint,
  target_company_id uuid,
  target_leader_account_id uuid,
  target_replica_account_ids uuid[],
  target_allocation_cents bigint[],
  target_phase public.operation_phase,
  target_allocation_reason text,
  target_observations text default null,
  target_source public.daily_control_source default 'manual',
  target_source_event_key text default null,
  target_received_balance_cents bigint default null,
  target_sync_issue_reason text default null
)
returns table (
  daily_control_id uuid,
  control_number integer,
  balance_after_cents bigint,
  operating_result_cents bigint,
  operation_entries_created integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  participant_ids uuid[];
  participant_count integer;
  matching_accounts integer;
  calculated_result bigint;
  base_result record;
  existing_reason text;
begin
  if actor_id is null then
    raise exception 'Authentication is required';
  end if;
  if nullif(btrim(target_allocation_reason), '') is null then
    raise exception 'A custom allocation reason is required';
  end if;

  target_replica_account_ids := coalesce(target_replica_account_ids, array[]::uuid[]);
  participant_ids := array_prepend(target_leader_account_id, target_replica_account_ids);
  participant_count := cardinality(participant_ids);

  if participant_count < 1 or participant_count > 250
    or cardinality(target_allocation_cents) <> participant_count then
    raise exception 'Every participant requires exactly one allocation';
  end if;
  if (select count(distinct account_id)
      from unnest(participant_ids) as participant(account_id)) <> participant_count then
    raise exception 'Participant accounts cannot be repeated';
  end if;

  select count(*)::integer into matching_accounts
  from public.accounts as accounts
  where accounts.id = any(participant_ids)
    and accounts.period_id = target_period_id
    and accounts.company_id = target_company_id;
  if matching_accounts <> participant_count then
    raise exception 'All participants must belong to the selected company and period';
  end if;

  select * into base_result
  from public.confirm_nodal_daily_control(
    target_period_id => target_period_id,
    target_kind => 'balance_update',
    target_operated_on => target_operated_on,
    target_confirmation_key => target_confirmation_key,
    target_balance_cents => target_balance_cents,
    target_company_id => target_company_id,
    target_leader_account_id => target_leader_account_id,
    target_replica_account_ids => array[]::uuid[],
    target_phase => target_phase,
    target_observations => target_observations,
    target_source => target_source,
    target_source_event_key => target_source_event_key,
    target_received_balance_cents => target_received_balance_cents,
    target_sync_issue_reason => target_sync_issue_reason
  );

  select controls.allocation_reason into existing_reason
  from public.daily_controls as controls
  where controls.id = base_result.daily_control_id;
  if existing_reason is not null then
    return query select base_result.daily_control_id, base_result.control_number,
      base_result.balance_after_cents, base_result.operating_result_cents,
      participant_count;
    return;
  end if;

  calculated_result := base_result.operating_result_cents;
  if (select coalesce(sum(value), 0) from unnest(target_allocation_cents) as allocation(value))
    <> calculated_result then
    raise exception 'Custom allocations must equal the complete operating result';
  end if;

  delete from public.operation_entries as entries
  where entries.daily_control_id = base_result.daily_control_id;
  delete from public.daily_control_participants as participants
  where participants.daily_control_id = base_result.daily_control_id;

  insert into public.daily_control_participants (
    daily_control_id, period_id, account_id, role, allocated_result_cents
  )
  select base_result.daily_control_id, target_period_id, participant.account_id,
    case when participant.ordinality = 1 then 'leader'::public.daily_control_participant_role
      else 'replica'::public.daily_control_participant_role end,
    target_allocation_cents[participant.ordinality]
  from unnest(participant_ids) with ordinality as participant(account_id, ordinality);

  insert into public.operation_entries (
    period_id, daily_control_id, account_id, operated_on, phase,
    participant_role, destination, magnitude_cents, created_by
  )
  select target_period_id, base_result.daily_control_id, participant.account_id,
    target_operated_on, target_phase,
    case when participant.ordinality = 1 then 'leader'::public.daily_control_participant_role
      else 'replica'::public.daily_control_participant_role end,
    case
      when target_allocation_cents[participant.ordinality] > 0
        then 'NETO BROKER +'::public.broker_result_destination
      when target_allocation_cents[participant.ordinality] < 0
        then 'NETO BROKER -'::public.broker_result_destination
      else 'NONE'::public.broker_result_destination
    end,
    abs(target_allocation_cents[participant.ordinality]), actor_id
  from unnest(participant_ids) with ordinality as participant(account_id, ordinality);

  update public.daily_controls as controls
  set allocation_reason = btrim(target_allocation_reason),
    updated_by = actor_id,
    updated_at = now()
  where controls.id = base_result.daily_control_id;

  update public.audit_events as events
  set action = 'daily_control_confirmed_custom_allocation',
    current_data = events.current_data || jsonb_build_object(
      'replica_account_ids', target_replica_account_ids,
      'allocation_account_ids', participant_ids,
      'allocation_cents', target_allocation_cents,
      'allocation_reason', btrim(target_allocation_reason),
      'operation_entries_created', participant_count
    ),
    reason = btrim(target_allocation_reason)
  where events.entity_table = 'daily_controls'
    and events.entity_id = base_result.daily_control_id
    and events.action = 'daily_control_confirmed';

  return query select base_result.daily_control_id, base_result.control_number,
    base_result.balance_after_cents, base_result.operating_result_cents,
    participant_count;
end;
$$;

revoke all on function public.confirm_nodal_daily_control_custom_allocation(
  uuid, date, uuid, bigint, uuid, uuid, uuid[], bigint[],
  public.operation_phase, text, text, public.daily_control_source, text, bigint, text
) from public, anon;

grant execute on function public.confirm_nodal_daily_control_custom_allocation(
  uuid, date, uuid, bigint, uuid, uuid, uuid[], bigint[],
  public.operation_phase, text, text, public.daily_control_source, text, bigint, text
) to authenticated;
