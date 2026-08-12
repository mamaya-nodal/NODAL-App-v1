-- Corrección histórica transaccional de un saldo de Control Diario.
-- Recalcula la cadena posterior y conserva los valores previos en auditoría.

create function public.correct_nodal_daily_control_balance(
  target_period_id uuid,
  target_daily_control_id uuid,
  target_balance_cents bigint,
  target_reason text
)
returns table (
  corrected_daily_control_id uuid,
  affected_controls integer,
  affected_operation_entries integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_control record;
  current_control record;
  previous_balance bigint := null;
  calculated_before bigint;
  calculated_after bigint;
  calculated_result bigint;
  participant_count integer;
  allocated_result bigint;
  calculated_destination public.broker_result_destination;
  changed_controls integer := 0;
  changed_entries integer := 0;
  prior_snapshot jsonb;
  current_snapshot jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required';
  end if;
  if target_balance_cents is null or target_balance_cents < 0 then
    raise exception 'The corrected balance must be nonnegative';
  end if;
  if nullif(btrim(target_reason), '') is null then
    raise exception 'A correction reason is required';
  end if;

  perform 1
  from public.periods as periods
  join public.workspaces as spaces on spaces.id = periods.workspace_id
  join public.nodal_users as users on users.id = spaces.owner_user_id
  where periods.id = target_period_id
    and spaces.owner_user_id = actor_id
    and users.access_state = 'active'
  for update of periods;
  if not found then
    raise exception 'The selected period is not available to this user';
  end if;

  select controls.* into target_control
  from public.daily_controls as controls
  where controls.id = target_daily_control_id
    and controls.period_id = target_period_id
  for update;
  if not found or target_control.kind <> 'balance_update' then
    raise exception 'Only an existing balance update can be corrected';
  end if;
  if target_control.balance_after_cents = target_balance_cents then
    raise exception 'The corrected balance must be different';
  end if;

  perform 1 from public.daily_controls as controls
  where controls.period_id = target_period_id
  order by controls.control_number
  for update;

  select jsonb_build_object(
    'controls', coalesce(jsonb_agg(to_jsonb(controls) order by controls.control_number)
      filter (where controls.id is not null), '[]'::jsonb),
    'participants', coalesce((
      select jsonb_agg(to_jsonb(participants) order by participants.daily_control_id, participants.account_id)
      from public.daily_control_participants as participants
      where participants.period_id = target_period_id
        and participants.daily_control_id in (
          select affected.id from public.daily_controls as affected
          where affected.period_id = target_period_id
            and affected.control_number >= target_control.control_number
        )
    ), '[]'::jsonb),
    'operation_entries', coalesce((
      select jsonb_agg(to_jsonb(entries) order by entries.daily_control_id, entries.account_id)
      from public.operation_entries as entries
      where entries.period_id = target_period_id
        and entries.daily_control_id in (
          select affected.id from public.daily_controls as affected
          where affected.period_id = target_period_id
            and affected.control_number >= target_control.control_number
        )
    ), '[]'::jsonb)
  ) into prior_snapshot
  from public.daily_controls as controls
  where controls.period_id = target_period_id
    and controls.control_number >= target_control.control_number;

  for current_control in
    select controls.* from public.daily_controls as controls
    where controls.period_id = target_period_id
    order by controls.control_number
  loop
    calculated_before := previous_balance;

    if current_control.kind = 'deposit' then
      calculated_after := coalesce(previous_balance, 0) + current_control.movement_cents;
      calculated_result := null;
    elsif current_control.kind = 'withdrawal' then
      if previous_balance is null or current_control.movement_cents > previous_balance then
        raise exception 'The correction would make a withdrawal exceed the available balance';
      end if;
      calculated_after := previous_balance - current_control.movement_cents;
      calculated_result := null;
    else
      if previous_balance is null then
        raise exception 'A balance update requires a previous balance';
      end if;
      calculated_after := case
        when current_control.id = target_daily_control_id then target_balance_cents
        else current_control.balance_after_cents
      end;
      calculated_result := calculated_after - previous_balance;

      select count(*)::integer into participant_count
      from public.daily_control_participants as participants
      where participants.daily_control_id = current_control.id;
      if participant_count < 1 or mod(calculated_result, participant_count) <> 0 then
        raise exception 'The correction creates a result that cannot be divided into exact cents';
      end if;
      allocated_result := calculated_result / participant_count;
      calculated_destination := case
        when allocated_result > 0 then 'NETO BROKER +'::public.broker_result_destination
        when allocated_result < 0 then 'NETO BROKER -'::public.broker_result_destination
        else 'NONE'::public.broker_result_destination
      end;

      if current_control.control_number >= target_control.control_number then
        update public.daily_control_participants as participants
        set allocated_result_cents = allocated_result
        where participants.daily_control_id = current_control.id;

        update public.operation_entries as entries
        set destination = calculated_destination,
          magnitude_cents = abs(allocated_result),
          updated_by = actor_id,
          updated_at = now()
        where entries.daily_control_id = current_control.id;
        get diagnostics participant_count = row_count;
        changed_entries := changed_entries + participant_count;
      end if;
    end if;

    if current_control.control_number >= target_control.control_number then
      update public.daily_controls as controls
      set balance_before_cents = calculated_before,
        balance_after_cents = calculated_after,
        operating_result_cents = calculated_result,
        sync_issue_reason = case
          when controls.id = target_daily_control_id and controls.source = 'ninjatrader'
            then btrim(target_reason)
          else controls.sync_issue_reason
        end,
        updated_by = actor_id,
        updated_at = now()
      where controls.id = current_control.id;
      changed_controls := changed_controls + 1;
    end if;

    previous_balance := calculated_after;
  end loop;

  select jsonb_build_object(
    'controls', coalesce(jsonb_agg(to_jsonb(controls) order by controls.control_number)
      filter (where controls.id is not null), '[]'::jsonb),
    'participants', coalesce((
      select jsonb_agg(to_jsonb(participants) order by participants.daily_control_id, participants.account_id)
      from public.daily_control_participants as participants
      where participants.period_id = target_period_id
        and participants.daily_control_id in (
          select affected.id from public.daily_controls as affected
          where affected.period_id = target_period_id
            and affected.control_number >= target_control.control_number
        )
    ), '[]'::jsonb),
    'operation_entries', coalesce((
      select jsonb_agg(to_jsonb(entries) order by entries.daily_control_id, entries.account_id)
      from public.operation_entries as entries
      where entries.period_id = target_period_id
        and entries.daily_control_id in (
          select affected.id from public.daily_controls as affected
          where affected.period_id = target_period_id
            and affected.control_number >= target_control.control_number
        )
    ), '[]'::jsonb)
  ) into current_snapshot
  from public.daily_controls as controls
  where controls.period_id = target_period_id
    and controls.control_number >= target_control.control_number;

  insert into public.audit_events (
    actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
  ) values (
    actor_id, 'daily_controls', target_daily_control_id,
    'daily_control_balance_corrected', prior_snapshot, current_snapshot, btrim(target_reason)
  );

  return query select target_daily_control_id, changed_controls, changed_entries;
end;
$$;

revoke all on function public.correct_nodal_daily_control_balance(uuid, uuid, bigint, text)
from public, anon;
grant execute on function public.correct_nodal_daily_control_balance(uuid, uuid, bigint, text)
to authenticated;
