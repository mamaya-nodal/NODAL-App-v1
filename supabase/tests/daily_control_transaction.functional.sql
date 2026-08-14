begin;

do $$
declare
  test_actor_id uuid;
  test_workspace_id uuid;
  test_company_id uuid;
  test_period_id uuid := gen_random_uuid();
  test_leader_id uuid := gen_random_uuid();
  test_replica_two_id uuid := gen_random_uuid();
  test_replica_three_id uuid := gen_random_uuid();
  deposit_confirmation_key uuid := '10000000-0000-4000-8000-000000000001';
  balance_confirmation_key uuid := '10000000-0000-4000-8000-000000000002';
  event_retry_confirmation_key uuid := '10000000-0000-4000-8000-000000000003';
  invalid_confirmation_key uuid := '10000000-0000-4000-8000-000000000004';
  custom_confirmation_key uuid := '10000000-0000-4000-8000-000000000005';
  deposit_result record;
  balance_result record;
  retry_result record;
  correction_result record;
  custom_result record;
  stored_control record;
  participant_total bigint;
  participant_count integer;
  entry_count integer;
  leader_count integer;
  replica_count integer;
  audit_count integer;
  activity_count integer;
  original_balance_amount bigint;
begin
  select users.id, spaces.id
  into test_actor_id, test_workspace_id
  from public.nodal_users as users
  join public.workspaces as spaces on spaces.owner_user_id = users.id
  where users.access_state = 'active'
  order by users.created_at, spaces.created_at
  limit 1;

  if test_actor_id is null then
    raise exception 'Functional test requires one active development user';
  end if;

  select companies.id
  into test_company_id
  from public.companies as companies
  where companies.code = 'LUCID';

  if test_company_id is null then
    raise exception 'Functional test requires the confirmed LUCID catalog entry';
  end if;

  perform set_config('request.jwt.claim.sub', test_actor_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into public.periods (id, workspace_id, period_month)
  values (test_period_id, test_workspace_id, date '2099-01-01');

  insert into public.accounts (
    id, period_id, company_id, reference_number, state, created_by
  )
  values
    (test_leader_id, test_period_id, test_company_id, 900001, 'virgin', test_actor_id),
    (test_replica_two_id, test_period_id, test_company_id, 900002, 'virgin', test_actor_id),
    (test_replica_three_id, test_period_id, test_company_id, 900003, 'virgin', test_actor_id);

  select * into deposit_result
  from public.confirm_nodal_daily_control(
    target_period_id => test_period_id,
    target_kind => 'deposit',
    target_operated_on => date '2099-01-10',
    target_confirmation_key => deposit_confirmation_key,
    target_amount_cents => 500000,
    target_origin_destination => 'Aporte trader'
  );

  if deposit_result.control_number <> 1
    or deposit_result.balance_after_cents <> 500000
    or deposit_result.operating_result_cents is not null
    or deposit_result.operation_entries_created <> 0 then
    raise exception 'Deposit result did not match the expected initial balance';
  end if;

  select * into balance_result
  from public.confirm_nodal_daily_control(
    target_period_id => test_period_id,
    target_kind => 'balance_update',
    target_operated_on => date '2099-01-10',
    target_confirmation_key => balance_confirmation_key,
    target_balance_cents => 560000,
    target_company_id => test_company_id,
    target_leader_account_id => test_leader_id,
    target_replica_account_ids => array[test_replica_two_id, test_replica_three_id],
    target_phase => 'Evaluacion',
    target_source => 'ninjatrader',
    target_source_event_key => 'functional-test-event-001',
    target_received_balance_cents => 560000
  );

  if balance_result.control_number <> 2
    or balance_result.balance_after_cents <> 560000
    or balance_result.operating_result_cents <> 60000
    or balance_result.operation_entries_created <> 3 then
    raise exception 'Balance result did not match the expected distribution';
  end if;

  select * into stored_control
  from public.daily_controls as controls
  where controls.id = balance_result.daily_control_id;

  if stored_control.balance_before_cents <> 500000
    or stored_control.source <> 'ninjatrader'
    or stored_control.received_balance_cents <> 560000 then
    raise exception 'Stored broker origin or balance chain is incorrect';
  end if;

  select count(*)::integer, sum(participants.allocated_result_cents)
  into participant_count, participant_total
  from public.daily_control_participants as participants
  where participants.daily_control_id = balance_result.daily_control_id;

  if participant_count <> 3 or participant_total <> 60000 then
    raise exception 'Participants do not reconcile with the total result';
  end if;

  select
    count(*)::integer,
    count(*) filter (where entries.participant_role = 'leader')::integer,
    count(*) filter (where entries.participant_role = 'replica')::integer
  into entry_count, leader_count, replica_count
  from public.operation_entries as entries
  where entries.daily_control_id = balance_result.daily_control_id
    and entries.destination = 'NETO BROKER +'
    and entries.magnitude_cents = 20000;

  if entry_count <> 3 or leader_count <> 1 or replica_count <> 2 then
    raise exception 'Derived operation entries have incorrect roles or amounts';
  end if;

  select * into retry_result
  from public.confirm_nodal_daily_control(
    target_period_id => test_period_id,
    target_kind => 'balance_update',
    target_operated_on => date '2099-01-10',
    target_confirmation_key => event_retry_confirmation_key,
    target_balance_cents => 560000,
    target_company_id => test_company_id,
    target_leader_account_id => test_leader_id,
    target_replica_account_ids => array[test_replica_two_id, test_replica_three_id],
    target_phase => 'Evaluacion',
    target_source => 'ninjatrader',
    target_source_event_key => 'functional-test-event-001',
    target_received_balance_cents => 560000
  );

  if retry_result.daily_control_id <> balance_result.daily_control_id then
    raise exception 'Repeated NinjaTrader event created a different control';
  end if;

  if (select count(*) from public.daily_controls where period_id = test_period_id) <> 2
    or (select count(*) from public.operation_entries where period_id = test_period_id) <> 3 then
    raise exception 'Idempotent retry duplicated economic rows';
  end if;

  select count(*)::integer
  into audit_count
  from public.audit_events as events
  where events.entity_id in (deposit_result.daily_control_id, balance_result.daily_control_id)
    and events.action = 'daily_control_confirmed';

  if audit_count <> 2 then
    raise exception 'Each confirmed control must have exactly one audit event';
  end if;

  begin
    perform *
    from public.confirm_nodal_daily_control(
      target_period_id => test_period_id,
      target_kind => 'balance_update',
      target_operated_on => date '2099-01-10',
      target_confirmation_key => invalid_confirmation_key,
      target_balance_cents => 560001,
      target_company_id => test_company_id,
      target_leader_account_id => test_leader_id,
      target_replica_account_ids => array[test_replica_two_id, test_replica_three_id],
      target_phase => 'Evaluacion'
    );
    raise exception 'Expected exact-cent validation did not run';
  exception
    when others then
      if sqlerrm = 'Expected exact-cent validation did not run'
        or position('exact cents' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  select * into correction_result
  from public.correct_nodal_daily_control_balance(
    target_period_id => test_period_id,
    target_daily_control_id => balance_result.daily_control_id,
    target_balance_cents => 551000,
    target_reason => 'Correccion funcional de saldo mal informado'
  );

  if correction_result.affected_controls <> 1
    or correction_result.affected_operation_entries <> 3 then
    raise exception 'Correction did not report the affected rows';
  end if;

  if (select operating_result_cents from public.daily_controls
      where id = balance_result.daily_control_id) <> 51000
    or (select sum(allocated_result_cents) from public.daily_control_participants
        where daily_control_id = balance_result.daily_control_id) <> 51000
    or (select count(*) from public.operation_entries
        where daily_control_id = balance_result.daily_control_id
          and destination = 'NETO BROKER +'
          and magnitude_cents = 17000) <> 3 then
    raise exception 'Correction did not recalculate controls and derived rows';
  end if;

  if (select count(*) from public.audit_events
      where entity_id = balance_result.daily_control_id
        and action = 'daily_control_balance_corrected'
        and previous_data is not null and current_data is not null) <> 1 then
    raise exception 'Correction did not preserve its audit snapshots';
  end if;

  select * into custom_result
  from public.confirm_nodal_daily_control_custom_allocation(
    target_period_id => test_period_id,
    target_operated_on => date '2099-01-10',
    target_confirmation_key => custom_confirmation_key,
    target_balance_cents => 601000,
    target_company_id => test_company_id,
    target_leader_account_id => test_leader_id,
    target_replica_account_ids => array[test_replica_two_id, test_replica_three_id],
    target_allocation_cents => array[12000, 20000, 18000]::bigint[],
    target_phase => 'Evaluacion',
    target_allocation_reason => 'Una replica tuvo una ejecucion diferente',
    target_source => 'ninjatrader',
    target_source_event_key => 'functional-test-event-custom-001',
    target_received_balance_cents => 601000
  );

  if custom_result.operating_result_cents <> 50000
    or custom_result.operation_entries_created <> 3
    or (select sum(allocated_result_cents) from public.daily_control_participants
        where daily_control_id = custom_result.daily_control_id) <> 50000
    or (select count(*) from public.operation_entries
        where daily_control_id = custom_result.daily_control_id
          and magnitude_cents in (12000, 20000, 18000)) <> 3 then
    raise exception 'Custom allocation did not preserve exact per-account amounts';
  end if;

  if (select count(*) from public.audit_events
      where entity_id = custom_result.daily_control_id
        and action = 'daily_control_confirmed_custom_allocation'
        and reason = 'Una replica tuvo una ejecucion diferente') <> 1 then
    raise exception 'Custom allocation did not preserve its reason in audit';
  end if;

  begin
    perform * from public.correct_nodal_daily_control_balance(
      target_period_id => test_period_id,
      target_daily_control_id => custom_result.daily_control_id,
      target_balance_cents => 599000,
      target_reason => 'Intento sin redistribucion explicita'
    );
    raise exception 'Expected custom allocation protection did not run';
  exception
    when others then
      if sqlerrm = 'Expected custom allocation protection did not run'
        or position('explicit redistribution' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  select * into correction_result
  from public.correct_nodal_daily_control_balance_with_allocations(
    target_period_id => test_period_id,
    target_daily_control_id => custom_result.daily_control_id,
    target_balance_cents => 599000,
    target_reason => 'Correccion con redistribucion explicita',
    target_custom_allocations => jsonb_build_object(
      custom_result.daily_control_id::text,
      jsonb_build_array(
        jsonb_build_object('account_id', test_leader_id, 'amount_cents', 10000),
        jsonb_build_object('account_id', test_replica_two_id, 'amount_cents', 20000),
        jsonb_build_object('account_id', test_replica_three_id, 'amount_cents', 18000)
      )
    )
  );

  if correction_result.affected_controls <> 1
    or correction_result.affected_operation_entries <> 3
    or (select operating_result_cents from public.daily_controls
        where id = custom_result.daily_control_id) <> 48000
    or (select sum(allocated_result_cents) from public.daily_control_participants
        where daily_control_id = custom_result.daily_control_id) <> 48000
    or (select count(*) from public.operation_entries
        where daily_control_id = custom_result.daily_control_id
          and magnitude_cents in (10000, 20000, 18000)) <> 3 then
    raise exception 'Explicit custom redistribution did not rewrite exact derived rows';
  end if;

  if (select count(*) from public.audit_events
      where entity_id = custom_result.daily_control_id
        and action = 'daily_control_balance_corrected_with_allocations'
        and reason = 'Correccion con redistribucion explicita'
        and previous_data is not null and current_data is not null) <> 1 then
    raise exception 'Explicit custom redistribution did not preserve audit snapshots';
  end if;

  select count(*)::integer
  into activity_count
  from public.list_nodal_period_activity(test_period_id);

  if activity_count <> 5 then
    raise exception 'Period activity did not return every allowed functional event';
  end if;

  select activity.primary_amount_cents
  into original_balance_amount
  from public.list_nodal_period_activity(test_period_id) as activity
  where activity.entity_id = balance_result.daily_control_id
    and activity.action = 'daily_control_confirmed';

  if original_balance_amount <> 60000 then
    raise exception 'Original activity amount was overwritten by the corrected value';
  end if;

  if (select reason from public.list_nodal_period_activity(test_period_id)
      where action = 'daily_control_balance_corrected_with_allocations')
      <> 'Correccion con redistribucion explicita' then
    raise exception 'Period activity did not expose the correction reason';
  end if;
end;
$$;

select 'daily control functional transaction passed and will now roll back' as result;

rollback;
