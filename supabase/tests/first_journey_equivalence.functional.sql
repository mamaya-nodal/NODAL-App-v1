begin;

do $$
declare
  test_actor_id uuid;
  test_period_id uuid;
  test_company_id uuid;
  business_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  purchase_result record;
  deposit_result record;
  balance_result record;
  created_account_ids uuid[] := array[]::uuid[];
  created_purchase_ids uuid[] := array[]::uuid[];
  selected_account_ids uuid[] := array[]::uuid[];
  purchase_index integer;
  activity_count integer;
begin
  select users.id, periods.id
  into test_actor_id, test_period_id
  from public.nodal_users as users
  join public.workspaces as spaces on spaces.owner_user_id = users.id
  join public.periods as periods on periods.workspace_id = spaces.id
  where users.access_state = 'active'
    and spaces.modality = 'real'
    and periods.period_month = date_trunc('month', business_today)::date
  order by users.created_at, spaces.created_at
  limit 1;

  if test_actor_id is null then
    raise exception 'Equivalence test requires an active user with the current Real period';
  end if;

  select companies.id
  into test_company_id
  from public.companies as companies
  where companies.code = 'LUCID'
    and companies.is_active;

  if test_company_id is null then
    raise exception 'Equivalence test requires the confirmed LUCID catalog entry';
  end if;

  perform set_config('request.jwt.claim.sub', test_actor_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  for purchase_index in 1..8 loop
    select * into purchase_result
    from public.create_nodal_purchase(
      target_period_id => test_period_id,
      target_company_id => test_company_id,
      target_price_cents => 8900,
      target_funds_origin => 'Aporte trader'
    );

    created_account_ids := array_append(created_account_ids, purchase_result.account_id);
    created_purchase_ids := array_append(created_purchase_ids, purchase_result.purchase_id);
  end loop;

  selected_account_ids := array[
    created_account_ids[1],
    created_account_ids[4],
    created_account_ids[7],
    created_account_ids[8]
  ];

  select * into deposit_result
  from public.confirm_nodal_daily_control(
    target_period_id => test_period_id,
    target_kind => 'deposit',
    target_operated_on => business_today,
    target_confirmation_key => gen_random_uuid(),
    target_amount_cents => 500000,
    target_origin_destination => 'Aporte trader'
  );

  select * into balance_result
  from public.confirm_nodal_daily_control(
    target_period_id => test_period_id,
    target_kind => 'balance_update',
    target_operated_on => business_today,
    target_confirmation_key => gen_random_uuid(),
    target_balance_cents => 550000,
    target_company_id => test_company_id,
    target_leader_account_id => selected_account_ids[1],
    target_replica_account_ids => selected_account_ids[2:4],
    target_phase => 'Evaluacion',
    target_source => 'manual'
  );

  if deposit_result.balance_after_cents <> 500000
    or deposit_result.operating_result_cents is not null then
    raise exception 'Initial deposit did not establish the expected reference balance';
  end if;

  if balance_result.balance_after_cents <> 550000
    or balance_result.operating_result_cents <> 50000
    or balance_result.operation_entries_created <> 4 then
    raise exception 'Broker balance did not produce the expected total and entries';
  end if;

  if (select count(*) from public.daily_control_participants
      where daily_control_id = balance_result.daily_control_id
        and account_id = any(selected_account_ids)
        and allocated_result_cents = 12500) <> 4 then
    raise exception 'Leader and explicit replicas did not receive USD 125 each';
  end if;

  if (select count(*) from public.daily_control_participants
      where daily_control_id = balance_result.daily_control_id
        and account_id = any(array[
          created_account_ids[2], created_account_ids[3],
          created_account_ids[5], created_account_ids[6]
        ])) <> 0 then
    raise exception 'Unselected intermediate accounts were inferred as replicas';
  end if;

  if (select count(*) from public.operation_entries
      where daily_control_id = balance_result.daily_control_id
        and destination = 'NETO BROKER +'
        and magnitude_cents = 12500) <> 4 then
    raise exception 'Registro de Operaciones did not preserve the four positive entries';
  end if;

  if (select count(*) from public.accounts
      where id = any(created_account_ids) and state = 'virgin') <> 8 then
    raise exception 'Partial broker results changed account state before TOTAL GANANCIA';
  end if;

  select count(*)::integer
  into activity_count
  from public.list_nodal_period_activity(test_period_id) as activity
  where activity.entity_id = any(
    created_purchase_ids || array[deposit_result.daily_control_id, balance_result.daily_control_id]
  );

  if activity_count <> 10 then
    raise exception 'Activity history did not reconstruct the eight purchases and two controls';
  end if;

  if (select primary_amount_cents
      from public.list_nodal_period_activity(test_period_id)
      where entity_id = balance_result.daily_control_id
        and action = 'daily_control_confirmed') <> 50000 then
    raise exception 'Activity history did not preserve the USD 500 operating result';
  end if;
end;
$$;

select 'first complete equivalence journey passed and will now roll back' as result;

rollback;

