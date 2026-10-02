-- Reparación acotada del caso real de Natalia Albini. Cinco evaluaciones de
-- Tradeify alcanzaron el objetivo y fueron reemplazadas por cinco funded, pero
-- el inventario nuevo se perdió mientras la identidad estaba pausada. La
-- cobertura del 2/10 quedó bloqueada sin participantes y no produjo asientos.

do $$
declare
  target_owner_id constant uuid := '448eafd0-8158-401a-91fc-5819391b5f4e';
  target_identity_id constant uuid := 'd3612dff-acd4-46c7-94c3-e6aaae82c06f';
  target_connector_id constant uuid := '1a6e0fe1-a279-436d-9346-0b7d52b703b0';
  target_batch_id constant uuid := 'ab0f8a0e-3e44-4490-a93e-c0c6213cf37e';
  transition_at constant timestamptz := '2026-10-02T13:48:28.418Z';
  target_revision bigint;
  committed boolean;
  target_state jsonb;
  transition_events jsonb;
  selected_batch public.ninja_operation_batches%rowtype;
  broker_session public.ninja_operation_probe_sessions%rowtype;
  selected_period_id uuid;
  selected_company_id uuid;
  leader_id uuid;
  prior_control public.daily_controls%rowtype;
  new_control_id uuid;
  next_control_number integer;
  per_account_cents bigint;
  target_distributed_cents bigint;
  source_key text;
  affected integer;
begin
  -- La migración es reproducible y queda inerte en bases que no contienen este
  -- conector real.
  if not exists(select 1 from public.ninja_connectors where id=target_connector_id) then
    return;
  end if;

  -- Permite volver a ejecutar el archivo sin duplicar asientos cuando se aplicó
  -- manualmente antes de que la historia de migraciones quedara sincronizada.
  if (
    select count(*)
    from public.ninja_account_links links
    where links.connector_id=target_connector_id
      and links.external_account_name=any(array[
        'FTDFYSLX50206875711','FTDFYSLX50350058576','FTDFYSLX50697218635',
        'FTDFYSLX50725178746','FTDFYSLX50788110561'
      ])
      and links.phase='Funded'
      and links.closed_at is null
  )=5 and exists(
    select 1
    from public.ninja_operation_batches batches
    join public.daily_controls controls on controls.id=batches.daily_control_id
    where batches.id=target_batch_id
      and batches.accounting_status='committed'
      and batches.context_prop_count=5
      and batches.accounting_phase='Primera vuelta'
      and controls.phase='Primera vuelta'
  ) then
    return;
  end if;

  create temporary table repair_natalia_tradeify_map(
    old_account_name text primary key,
    new_account_name text not null unique,
    account_id uuid not null,
    old_life_id text,
    new_life_id text not null default gen_random_uuid()::text
  ) on commit drop;

  insert into repair_natalia_tradeify_map(old_account_name,new_account_name,account_id) values
    ('TDFYSL50227867328','FTDFYSLX50206875711','2247a2ff-b955-4f58-90fc-5c38fc9ba433'),
    ('TDFYSL50293633704','FTDFYSLX50350058576','6a98ebb6-5c06-47de-baac-e3d7e638b82c'),
    ('TDFYSL50529077748','FTDFYSLX50697218635','539e248d-adc7-4681-bc51-b4fc0c1dbaf4'),
    ('TDFYSL50558089557','FTDFYSLX50725178746','cf36a02b-bfd6-4da6-acc7-3ccdaa43aee2'),
    ('TDFYSL50560378377','FTDFYSLX50788110561','c6883efc-2e9a-4a8f-a846-7fee6c0773ad');

  if (select count(*) from public.ninja_account_links links join repair_natalia_tradeify_map m
      on m.account_id=links.account_id and m.old_account_name=links.external_account_name
      where links.connector_id=target_connector_id and links.connection_name='Tradeify Nati') <> 5 then
    raise exception 'Natalia repair: the five Evaluation links do not match';
  end if;
  if exists(select 1 from public.ninja_account_links links join repair_natalia_tradeify_map m
      on m.new_account_name=links.external_account_name where links.connector_id=target_connector_id) then
    raise exception 'Natalia repair: a Funded link already exists';
  end if;
  if (select count(*) from public.identity_account_assignments assignments
      join repair_natalia_tradeify_map m on m.account_id=assignments.account_id
      where assignments.identity_id=target_identity_id and assignments.unassigned_at is null) <> 5 then
    raise exception 'Natalia repair: identity assignments do not match';
  end if;
  if (select count(*) from public.operation_entries entries join repair_natalia_tradeify_map m
      on m.account_id=entries.account_id where entries.phase='Evaluacion') <> 15 then
    raise exception 'Natalia repair: expected three Evaluation trades per account';
  end if;

  select states.revision into strict target_revision
  from public.ninja_transition_states states where states.connector_id=target_connector_id for update;
  update repair_natalia_tradeify_map m set old_life_id=life.value->>'lifeId'
  from public.ninja_transition_states states
  cross join lateral jsonb_array_elements(states.state->'lives') life(value)
  where states.connector_id=target_connector_id
    and life.value->'tracked'->>'externalAccountName'=m.old_account_name;
  if exists(select 1 from repair_natalia_tradeify_map where old_life_id is null) then
    raise exception 'Natalia repair: an Evaluation life is missing';
  end if;

  -- Reabre técnicamente las tres falsas quemas para que el mismo motor normal
  -- pueda aplicar las cinco transiciones y dejar sus eventos auditables.
  update public.ninja_account_links links set phase='Evaluation', life_id=m.old_life_id,
    closed_at=null, closure_reason=null
  from repair_natalia_tradeify_map m
  where links.connector_id=target_connector_id and links.connection_name='Tradeify Nati'
    and links.account_id=m.account_id and links.external_account_name=m.old_account_name;
  get diagnostics affected=row_count;
  if affected<>5 then raise exception 'Natalia repair: could not reopen all Evaluation links'; end if;

  update public.accounts accounts set state='live',state_origin='automatic'
  from repair_natalia_tradeify_map m where accounts.id=m.account_id;

  select jsonb_build_object('lives',jsonb_agg(jsonb_build_object(
    'connectionName','Tradeify Nati','lifeId',m.new_life_id,'status','active',
    'tracked',jsonb_build_object(
      'phase','Funded','product','Select Flex','companyCode','TRADEFY',
      'balanceStatus','verified','balanceInCents',5418848,
      'connectionName','Tradeify Nati','burnFloorInCents',5010000,
      'lastBusinessDate','2026-10-02','accountSizeInCents',5000000,
      'externalAccountName',m.new_account_name,'reachedEvaluationTarget',false,
      'highestEodBalanceInCents',5418848
    )) order by m.new_account_name)) into target_state
  from repair_natalia_tradeify_map m;

  select jsonb_agg(jsonb_build_object(
    'automatic',true,'connectionName','Tradeify Nati',
    'fromAccountName',m.old_account_name,'fromLifeId',m.old_life_id,
    'kind','evaluation_to_funded','occurredAt',transition_at,
    'reason','Reparación auditada: Ninja mostró la cuenta funded compatible y el enrutamiento pausado omitió el cambio.',
    'sourceEventId','repair:natalia-tradeify-funded:2026-10-02',
    'toAccountName',m.new_account_name,'toLifeId',m.new_life_id
  ) order by m.new_account_name) into transition_events
  from repair_natalia_tradeify_map m;

  select public.commit_ninja_transition_state(target_connector_id,target_revision,target_state,transition_events)
  into committed;
  if committed is distinct from true then
    raise exception 'Natalia repair: transition state changed concurrently';
  end if;

  if (select count(*) from public.ninja_account_links links join repair_natalia_tradeify_map m
      on m.account_id=links.account_id and m.new_account_name=links.external_account_name
      where links.connector_id=target_connector_id and links.phase='Funded' and links.closed_at is null) <> 5 then
    raise exception 'Natalia repair: Funded links were not created';
  end if;
  if (select count(*) from public.ninja_account_ownership ownership join repair_natalia_tradeify_map m
      on m.new_account_name=ownership.account_name where ownership.physical_connector_id=target_connector_id
      and ownership.destination_connector_id=target_connector_id and ownership.owner_user_id=target_owner_id
      and ownership.connection_name='Tradeify Nati' and ownership.account_type='prop') <> 5 then
    raise exception 'Natalia repair: Funded ownership was not preserved';
  end if;

  select * into strict selected_batch from public.ninja_operation_batches
  where id=target_batch_id for update;
  if selected_batch.connector_id<>target_connector_id or selected_batch.status<>'unmatched'
    or selected_batch.accounting_status<>'blocked' or selected_batch.context_prop_count<>0
    or selected_batch.broker_result_cents<>-630222 or selected_batch.daily_control_id is not null then
    raise exception 'Natalia repair: the blocked broker batch no longer matches';
  end if;
  select * into strict broker_session from public.ninja_operation_probe_sessions
  where id=selected_batch.broker_session_id and status='closed';
  source_key:='ninja-operation:'||broker_session.opening_event_id::text;
  if exists(select 1 from public.daily_controls where source='ninjatrader' and source_event_key=source_key) then
    raise exception 'Natalia repair: the broker operation is already registered';
  end if;

  select accounts.period_id,accounts.company_id into strict selected_period_id,selected_company_id
  from public.accounts accounts join repair_natalia_tradeify_map m on m.account_id=accounts.id
  order by accounts.id limit 1;
  if (select count(distinct accounts.period_id) from public.accounts accounts
      join repair_natalia_tradeify_map m on m.account_id=accounts.id)<>1
    or (select count(distinct accounts.company_id) from public.accounts accounts
      join repair_natalia_tradeify_map m on m.account_id=accounts.id)<>1 then
    raise exception 'Natalia repair: accounts do not share period and company';
  end if;
  perform 1 from public.periods where id=selected_period_id for update;
  select * into strict prior_control from public.daily_controls
  where period_id=selected_period_id order by control_number desc limit 1 for update;
  if prior_control.balance_after_cents is null or prior_control.balance_after_cents+selected_batch.broker_result_cents<0 then
    raise exception 'Natalia repair: broker balance cannot accept the correction';
  end if;
  select accounts.id into strict leader_id from public.accounts accounts
  join repair_natalia_tradeify_map m on m.account_id=accounts.id
  order by accounts.reference_number,accounts.id limit 1;
  next_control_number:=prior_control.control_number+1;
  per_account_cents:=round(selected_batch.broker_result_cents::numeric/5)::bigint;
  target_distributed_cents:=per_account_cents*5;

  insert into public.daily_controls(
    period_id,control_number,operated_on,kind,balance_before_cents,balance_after_cents,
    operating_result_cents,company_id,leader_account_id,phase,observations,source,
    source_event_key,received_balance_cents,sync_issue_reason,confirmation_key,created_by
  ) values(
    selected_period_id,next_control_number,'2026-10-02','balance_update',
    prior_control.balance_after_cents,prior_control.balance_after_cents+selected_batch.broker_result_cents,
    selected_batch.broker_result_cents,selected_company_id,leader_id,'Primera vuelta',
    'Cobertura funded reconstruida desde el lote broker y la evidencia visual de NinjaTrader; la telemetría prop fue omitida por el enrutamiento pausado.',
    'ninjatrader',source_key,prior_control.balance_after_cents+selected_batch.broker_result_cents,
    null,selected_batch.id,target_owner_id
  ) returning id into new_control_id;

  insert into public.daily_control_participants(daily_control_id,period_id,account_id,role,allocated_result_cents)
  select new_control_id,selected_period_id,m.account_id,
    case when m.account_id=leader_id then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,
    per_account_cents from repair_natalia_tradeify_map m;

  insert into public.operation_entries(period_id,daily_control_id,account_id,operated_on,phase,
    participant_role,destination,magnitude_cents,created_by)
  select selected_period_id,new_control_id,m.account_id,'2026-10-02','Primera vuelta',
    case when m.account_id=leader_id then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,
    'NETO BROKER -',abs(per_account_cents),target_owner_id from repair_natalia_tradeify_map m;

  insert into public.ninja_operation_batch_manual_accounts(batch_id,account_id,allocated_broker_result_cents,created_by)
  select target_batch_id,m.account_id,per_account_cents,target_owner_id from repair_natalia_tradeify_map m;

  update public.ninja_operation_batches set status='ready',distributed_cents=target_distributed_cents,
    rounding_difference_cents=selected_batch.broker_result_cents-target_distributed_cents,
    accounting_mode='active',accounting_status='committed',accounting_blocking_reason=null,
    accounting_period_id=selected_period_id,accounting_company_id=selected_company_id,
    accounting_phase='Primera vuelta',operated_on='2026-10-02',daily_control_id=new_control_id,
    context_prop_count=5,updated_at=now() where id=target_batch_id;

  update public.ninja_broker_balance_events set status='confirmed',daily_control_id=new_control_id,
    resolved_at=coalesce(resolved_at,now()) where connector_id=target_connector_id and source_event_id=source_key;

  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(target_owner_id,'daily_controls',new_control_id,'ninja_funded_transition_repaired',
    jsonb_build_object('identity_id',target_identity_id,'connector_id',target_connector_id,'batch_id',target_batch_id,
      'old_accounts',(select jsonb_agg(old_account_name order by old_account_name) from repair_natalia_tradeify_map),
      'funded_accounts',(select jsonb_agg(new_account_name order by new_account_name) from repair_natalia_tradeify_map),
      'broker_result_cents',selected_batch.broker_result_cents,'distributed_cents',target_distributed_cents,
      'rounding_difference_cents',selected_batch.broker_result_cents-target_distributed_cents,
      'evidence','Captura de NinjaTrader aportada por el usuario; no se inventaron ejecuciones prop faltantes.'),
    'Se restauró la transición de cinco evaluaciones a funded y el primer trade de Primera vuelta omitido por la ruta pausada.');
end
$$;
