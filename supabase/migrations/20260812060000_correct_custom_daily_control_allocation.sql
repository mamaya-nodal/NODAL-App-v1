-- Corrección histórica con redistribución explícita de repartos excepcionales.

create or replace function public.block_implicit_custom_allocation_rewrite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.explicit_custom_redistribution', true) is distinct from 'on'
    and exists (
      select 1 from public.daily_controls as controls
      where controls.id = old.daily_control_id
        and controls.allocation_reason is not null
    ) then
    raise exception 'Custom allocations require an explicit redistribution';
  end if;
  return new;
end;
$$;

create function public.correct_nodal_daily_control_balance_with_allocations(
  target_period_id uuid,
  target_daily_control_id uuid,
  target_balance_cents bigint,
  target_reason text,
  target_custom_allocations jsonb default '{}'::jsonb
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
  supplied_allocations jsonb;
  supplied_count integer;
  matching_count integer;
  supplied_total bigint;
  affected_custom_controls integer := 0;
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
  if target_custom_allocations is null
    or jsonb_typeof(target_custom_allocations) <> 'object' then
    raise exception 'Custom redistributions must be an object';
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

  perform set_config('app.explicit_custom_redistribution', 'on', true);

  select controls.balance_after_cents
  into previous_balance
  from public.periods as current_period
  join public.periods as earlier_period
    on earlier_period.workspace_id = current_period.workspace_id
    and earlier_period.period_month < current_period.period_month
  join public.daily_controls as controls on controls.period_id = earlier_period.id
  where current_period.id = target_period_id
  order by earlier_period.period_month desc, controls.control_number desc
  limit 1;

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
      if participant_count < 1 then
        raise exception 'A balance update requires participants';
      end if;

      if current_control.control_number >= target_control.control_number then
        if current_control.allocation_reason is not null then
          affected_custom_controls := affected_custom_controls + 1;
          supplied_allocations := target_custom_allocations -> current_control.id::text;
          if supplied_allocations is null
            or jsonb_typeof(supplied_allocations) <> 'array' then
            raise exception 'Every affected custom allocation requires an explicit redistribution';
          end if;

          supplied_count := jsonb_array_length(supplied_allocations);
          if supplied_count <> participant_count
            or exists (
              select 1 from jsonb_array_elements(supplied_allocations) as item(value)
              where jsonb_typeof(item.value -> 'account_id') <> 'string'
                or jsonb_typeof(item.value -> 'amount_cents') <> 'number'
                or (item.value ->> 'amount_cents') !~ '^-?[0-9]+$'
            ) then
            raise exception 'Every custom participant requires one integer-cent allocation';
          end if;

          select count(*)::integer, coalesce(sum((item.value ->> 'amount_cents')::bigint), 0)
          into matching_count, supplied_total
          from jsonb_array_elements(supplied_allocations) as item(value)
          join public.daily_control_participants as participants
            on participants.daily_control_id = current_control.id
            and participants.account_id = (item.value ->> 'account_id')::uuid;

          if matching_count <> participant_count
            or (select count(distinct item.value ->> 'account_id')
                from jsonb_array_elements(supplied_allocations) as item(value))
              <> participant_count then
            raise exception 'Custom redistribution accounts must match the original participants';
          end if;
          if supplied_total <> calculated_result then
            raise exception 'Custom redistributions must equal each complete operating result';
          end if;

          update public.daily_control_participants as participants
          set allocated_result_cents = (item.value ->> 'amount_cents')::bigint
          from jsonb_array_elements(supplied_allocations) as item(value)
          where participants.daily_control_id = current_control.id
            and participants.account_id = (item.value ->> 'account_id')::uuid;

          update public.operation_entries as entries
          set destination = case
              when participants.allocated_result_cents > 0
                then 'NETO BROKER +'::public.broker_result_destination
              when participants.allocated_result_cents < 0
                then 'NETO BROKER -'::public.broker_result_destination
              else 'NONE'::public.broker_result_destination
            end,
            magnitude_cents = abs(participants.allocated_result_cents),
            updated_by = actor_id,
            updated_at = now()
          from public.daily_control_participants as participants
          where entries.daily_control_id = current_control.id
            and participants.daily_control_id = entries.daily_control_id
            and participants.account_id = entries.account_id;
          get diagnostics matching_count = row_count;
          changed_entries := changed_entries + matching_count;
        else
          allocated_result := sign(calculated_result) * round(abs(calculated_result)::numeric / participant_count);
          calculated_destination := case
            when allocated_result > 0 then 'NETO BROKER +'::public.broker_result_destination
            when allocated_result < 0 then 'NETO BROKER -'::public.broker_result_destination
            else 'NONE'::public.broker_result_destination
          end;

          update public.daily_control_participants as participants
          set allocated_result_cents = allocated_result
          where participants.daily_control_id = current_control.id;

          update public.operation_entries as entries
          set destination = calculated_destination,
            magnitude_cents = abs(allocated_result),
            updated_by = actor_id,
            updated_at = now()
          where entries.daily_control_id = current_control.id;
          get diagnostics matching_count = row_count;
          changed_entries := changed_entries + matching_count;
        end if;
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

  if (select count(*) from jsonb_object_keys(target_custom_allocations))
    <> affected_custom_controls then
    raise exception 'Custom redistributions must reference exactly the affected custom controls';
  end if;

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
    ), '[]'::jsonb),
    'custom_redistributions', target_custom_allocations
  ) into current_snapshot
  from public.daily_controls as controls
  where controls.period_id = target_period_id
    and controls.control_number >= target_control.control_number;

  insert into public.audit_events (
    actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
  ) values (
    actor_id, 'daily_controls', target_daily_control_id,
    'daily_control_balance_corrected_with_allocations',
    prior_snapshot, current_snapshot, btrim(target_reason)
  );

  return query select target_daily_control_id, changed_controls, changed_entries;
end;
$$;

revoke all on function public.correct_nodal_daily_control_balance_with_allocations(
  uuid, uuid, bigint, text, jsonb
) from public, anon;

grant execute on function public.correct_nodal_daily_control_balance_with_allocations(
  uuid, uuid, bigint, text, jsonb
) to authenticated;
