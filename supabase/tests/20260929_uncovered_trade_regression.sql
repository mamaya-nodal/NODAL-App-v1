-- Run after the migration inside BEGIN ... ROLLBACK. Never COMMIT this fixture.
-- Uses the diagnosed, still-pending Mauricio trades; aborts if their state changes.
do $test$
declare
  mini uuid := 'c0161118-7d0d-420e-b00e-de7d5780d184';
  covered uuid := '5fb2f67e-6381-4316-889e-ef30e8028721';
  owner_id uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  pid uuid := '46deef83-7f88-4c90-9ef1-84a750166837';
  control_id uuid;
  repeated_id uuid;
  latest_balance bigint;
  count_before integer;
begin
  if (select count(*) from public.ninja_operation_batches where id in (mini,covered) and accounting_status='blocked')<>2 then
    raise exception 'Fixture changed: both diagnosed trades must remain pending';
  end if;
  select balance_after_cents into latest_balance from public.daily_controls where period_id=pid order by control_number desc limit 1;
  if latest_balance<>483282 then raise exception 'Fixture changed: unexpected opening balance'; end if;
  select count(*) into count_before from public.daily_controls where period_id=pid;
  if has_function_privilege('anon','public.confirm_ninja_uncovered_trade(uuid,bigint,boolean)','EXECUTE')
    or not has_function_privilege('authenticated','public.confirm_ninja_uncovered_trade(uuid,bigint,boolean)','EXECUTE')
    or has_function_privilege('authenticated','public.replace_pending_ninja_batch_members(uuid,jsonb)','EXECUTE') then
    raise exception 'Incorrect RPC permissions';
  end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.confirm_ninja_uncovered_trade(mini,1160,true);
    raise exception 'TEST FAILURE: foreign owner accepted';
  exception when raise_exception then
    if sqlerrm<>'Trade unavailable' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  begin
    perform public.confirm_ninja_uncovered_trade(mini,1160,false);
    raise exception 'TEST FAILURE: no confirmation accepted';
  exception when raise_exception then
    if sqlerrm<>'Explicit confirmation required' then raise; end if;
  end;
  begin
    perform public.confirm_ninja_uncovered_trade(mini,1161,true);
    raise exception 'TEST FAILURE: changed amount accepted';
  exception when raise_exception then
    if sqlerrm<>'Trade amount changed; refresh before confirming' then raise; end if;
  end;
  begin
    perform public.confirm_ninja_uncovered_trade(covered,51060,true);
    raise exception 'TEST FAILURE: prop coverage accepted as standalone';
  exception when raise_exception then
    if sqlerrm<>'Trade has prop context; refresh before confirming' then raise; end if;
  end;
  control_id := public.confirm_ninja_uncovered_trade(mini,1160,true);
  repeated_id := public.confirm_ninja_uncovered_trade(mini,1160,true);
  if control_id<>repeated_id or (select count(*) from public.daily_controls where period_id=pid)<>count_before+1 then
    raise exception 'TEST FAILURE: confirmation is not idempotent';
  end if;
  if exists(select 1 from public.operation_entries where daily_control_id=control_id)
    or exists(select 1 from public.daily_control_participants where daily_control_id=control_id)
    or not exists(select 1 from public.audit_events where entity_id=control_id and action='ninja_uncovered_trade_confirmed') then
    raise exception 'TEST FAILURE: incorrect allocation or missing audit';
  end if;
  if public.replace_pending_ninja_batch_members(mini,'[]'::jsonb) then
    raise exception 'TEST FAILURE: committed members can be rewritten';
  end if;
  if not exists(select 1 from public.daily_controls where id=control_id and is_uncovered and operating_result_cents=1160 and balance_after_cents=484442) then
    raise exception 'TEST FAILURE: unexpected standalone amounts';
  end if;
  -- Simulate the TypeScript projection, which fills phase, company and period together.
  update public.ninja_operation_batches set accounting_phase='Primera vuelta',
    accounting_company_id='31f7ac9f-21c4-4322-b188-a6af31d882bd',
    accounting_period_id=pid,accounting_status='shadow_ready',accounting_blocking_reason=null where id=covered;
  perform public.commit_ninja_automatic_operation_batch(covered);
  if not exists(select 1 from public.daily_controls c join public.ninja_operation_batches b on b.daily_control_id=c.id
    where b.id=covered and c.balance_after_cents=535502 and c.operating_result_cents=51060 and c.phase='Primera vuelta' and not c.is_uncovered) then
    raise exception 'TEST FAILURE: following funded coverage does not reconcile';
  end if;
end $test$;
select 'PASS: isolation, confirmation, stale amount, prop guard, idempotency, audit, committed protection, funded continuity. ROLLBACK REQUIRED.' as regression;
