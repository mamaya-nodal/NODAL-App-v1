-- Run after 20260930120000, always inside this rolled-back transaction.
begin;

do $test$
declare
  owner_id uuid;
  first_connector uuid;
  second_connector uuid;
  first_event bigint;
  second_event bigint;
  first_session bigint;
  second_session bigint;
  first_accepted boolean;
begin
  select connectors.owner_user_id
  into owner_id
  from public.ninja_connectors connectors
  where connectors.status = 'active'
  group by connectors.owner_user_id
  having count(*) >= 2
  order by connectors.owner_user_id
  limit 1;

  if owner_id is null then
    raise exception 'The regression requires one owner with two active connectors';
  end if;

  select id into first_connector
  from public.ninja_connectors
  where owner_user_id = owner_id and status = 'active'
  order by id
  limit 1;

  select id into second_connector
  from public.ninja_connectors
  where owner_user_id = owner_id and status = 'active' and id <> first_connector
  order by id
  limit 1;

  insert into public.ninja_trade_telemetry_events(
    connector_id, event_id, event_type, occurred_at, connection_name,
    account_name, instrument, payload
  ) values (
    first_connector, 'regression-latency-' || gen_random_uuid()::text,
    'execution', now() - interval '30 minutes', 'Regression',
    'BROKER-LATENCY', 'MNQ DEC26', '{}'::jsonb
  ) returning id into first_event;

  insert into public.ninja_trade_telemetry_events(
    connector_id, event_id, event_type, occurred_at, connection_name,
    account_name, instrument, payload
  ) values (
    second_connector, 'regression-latency-' || gen_random_uuid()::text,
    'execution', now() - interval '29 minutes 52 seconds', 'Regression',
    'BROKER-LATENCY', 'MNQ DEC26', '{}'::jsonb
  ) returning id into second_event;

  insert into public.ninja_operation_probe_sessions(
    connector_id, connection_name, account_name, opening_event_id,
    opened_at, flat_at, last_event_at, settled_at, status,
    opening_balance, closing_balance, result, execution_count,
    instruments, direction, quantity
  ) values (
    first_connector, 'Regression', 'BROKER-LATENCY', first_event,
    now() - interval '30 minutes', now() - interval '20 minutes',
    now() - interval '20 minutes', now() - interval '20 minutes', 'closed',
    10000, 9454.26, -545.74, 2, array['MNQ DEC26'], 'Short', 1
  ) returning id into first_session;

  insert into public.ninja_operation_probe_sessions(
    connector_id, connection_name, account_name, opening_event_id,
    opened_at, flat_at, last_event_at, settled_at, status,
    opening_balance, closing_balance, result, execution_count,
    instruments, direction, quantity
  ) values (
    second_connector, 'Regression', 'BROKER-LATENCY', second_event,
    now() - interval '29 minutes 52 seconds', now() - interval '20 minutes',
    now() - interval '20 minutes', now() - interval '20 minutes', 'closed',
    10000, 9454.26, -545.74, 2, array['MNQ DEC26'], 'Short', 1
  ) returning id into second_session;

  select accepted into first_accepted
  from public.upsert_nodal_deduplicated_operation_batch(
    first_connector, first_session, 'unmatched', -54574, 0, -54574,
    now() - interval '30 minutes', now() - interval '20 minutes',
    'blocked', 'Regression first observation', null, null, null,
    current_date, 0, 1
  );

  if first_accepted is distinct from true then
    raise exception 'The first broker observation was not accepted';
  end if;
  if not exists (
    select 1 from public.ninja_operation_probe_sessions
    where id = second_session and excluded_at is not null
  ) then
    raise exception 'The mirrored session was not excluded';
  end if;
end;
$test$;

select 'PASS: identical cross-connector broker observations eight seconds apart are consolidated' as regression;
rollback;
