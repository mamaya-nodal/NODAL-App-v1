-- Reparacion puntual y auditable: la subcuenta 2167219 pertenece a Sebastian
-- Bonincontro. Su actividad del 30/09/2026 llego al espacio de Alfred porque
-- la app personal todavia no estaba vinculada. No existian controles diarios
-- ni lotes contables confirmados. La traza anterior se conserva excluida como
-- evidencia del envio equivocado; Sebastian comienza su contabilidad desde cero.

begin;

do $$
declare
  physical_connector constant uuid := '658adc9f-8ab0-4f58-a397-c425681e0b3d';
  personal_connector constant uuid := 'f6a0fd3e-02d8-43fa-8e13-4e6989d57eee';
  alfred_owner constant uuid := '448eafd0-8158-401a-91fc-5819391b5f4e';
  sebastian_owner constant uuid := 'ffabc050-c33c-47e5-8011-14404e5ee2d5';
  target_sessions constant bigint[] := array[161909,162077,162078,162079,162099];
  affected integer;
  live_balance bigint;
  previous_balance_state jsonb;
  previous_state jsonb;
begin
  if not exists(
    select 1 from public.ninja_connectors
    where id=physical_connector and owner_user_id=alfred_owner
      and identity_id='a161ad1c-1840-4f5b-83f6-cadd58f8a69a' and status='active'
  ) then raise exception 'Physical identity connector changed'; end if;

  if not exists(
    select 1 from public.ninja_connectors
    where id=personal_connector and owner_user_id=sebastian_owner
      and identity_id is null and status='active'
  ) then raise exception 'Sebastian personal destination changed'; end if;

  if not exists(
    select 1 from public.ninja_connector_route_epochs
    where physical_connector_id=physical_connector
      and destination_connector_id=personal_connector and effective_until is null
  ) then raise exception 'Personal route is not active'; end if;

  if not exists(
    select 1 from public.ninja_account_ownership
    where physical_connector_id=physical_connector and connection_name='En Vivo'
      and account_name='2167219' and account_type='broker'
      and destination_connector_id=physical_connector and owner_user_id=alfred_owner
  ) then raise exception 'Broker ownership changed'; end if;

  if (select count(*) from public.ninja_operation_probe_sessions
      where id=any(target_sessions) and connector_id=physical_connector
        and account_name='2167219' and connection_name='En Vivo'
        and status='closed' and excluded_at is null) <> 5
  then raise exception 'Expected five pending technical sessions'; end if;

  if exists(
    select 1 from public.ninja_operation_batches b
    where b.broker_session_id=any(target_sessions)
      and (b.daily_control_id is not null or b.accounting_status='committed')
  ) then raise exception 'A target operation was already posted to accounting'; end if;

  if exists(
    select 1 from public.ninja_broker_balance_states
    where connector_id=personal_connector
  ) then raise exception 'Sebastian already has a broker balance state'; end if;

  select balance_cents,to_jsonb(s) into live_balance,previous_balance_state
  from public.ninja_broker_balance_states s
  where connector_id=physical_connector for update;
  if not found then raise exception 'Expected live broker balance state is missing'; end if;

  select jsonb_build_object(
    'physical_connector_id',physical_connector,
    'personal_connector_id',personal_connector,
    'connection_name','En Vivo',
    'account_name','2167219',
    'session_ids',to_jsonb(target_sessions),
    'balance_state',previous_balance_state,
    'session_results',(
      select jsonb_agg(jsonb_build_object('id',id,'opened_at',opened_at,'result',result)
        order by opened_at)
      from public.ninja_operation_probe_sessions where id=any(target_sessions)
    ),
    'pending_balance_event_ids',(
      select coalesce(jsonb_agg(id order by observed_at),'[]'::jsonb)
      from public.ninja_broker_balance_events
      where connector_id=physical_connector and status='pending'
        and source_accounts @> '[{"accountName":"2167219","connectionName":"En Vivo"}]'::jsonb
    )
  ) into previous_state;

  update public.ninja_account_ownership set
    destination_connector_id=personal_connector,
    owner_user_id=sebastian_owner,
    claimed_at=now(),
    claimed_by=sebastian_owner
  where physical_connector_id=physical_connector and connection_name='En Vivo'
    and account_name='2167219' and account_type='broker'
    and destination_connector_id=physical_connector and owner_user_id=alfred_owner;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Broker ownership update was not singular'; end if;

  -- Las cinco sesiones se conservan bajo el origen que efectivamente las envio,
  -- pero se excluyen de Alfred y no se trasladan a la apertura de Sebastian.
  update public.ninja_operation_probe_sessions set
    excluded_at=now(),
    excluded_by=sebastian_owner,
    exclusion_reason='Actividad personal de Sebastian anterior al alta; no pertenece a la contabilidad de Alfred'
  where id=any(target_sessions) and connector_id=physical_connector and excluded_at is null;
  get diagnostics affected=row_count;
  if affected<>5 then raise exception 'Technical session reassignment was incomplete'; end if;

  update public.ninja_operation_batches set
    accounting_status='blocked',
    accounting_blocking_reason='Actividad personal de Sebastian excluida de la contabilidad de Alfred'
  where broker_session_id=any(target_sessions) and connector_id=physical_connector
    and daily_control_id is null and accounting_status<>'committed';
  get diagnostics affected=row_count;
  if affected<>5 then raise exception 'Technical batch reassignment was incomplete'; end if;

  update public.ninja_broker_balance_events set status='superseded'
  where connector_id=physical_connector and status='pending' and daily_control_id is null
    and source_accounts @> '[{"accountName":"2167219","connectionName":"En Vivo"}]'::jsonb;

  update public.ninja_broker_balance_states set
    connector_id=personal_connector,
    updated_at=now()
  where connector_id=physical_connector;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Broker state reassignment was incomplete'; end if;

  insert into public.audit_events(
    actor_user_id,entity_table,entity_id,action,previous_data,current_data,reason)
  values(
    sebastian_owner,'ninja_account_ownership',personal_connector,
    'historical_broker_owner_corrected',previous_state,
    jsonb_build_object(
      'destination_connector_id',personal_connector,
      'owner_user_id',sebastian_owner,
      'sessions_excluded_from_alfred',5,
      'accounting_records_created',0,
      'opening_method','start_from_zero_at_current_balance',
      'current_balance_cents',live_balance
    ),
    'La subcuenta era personal de Sebastian; fue observada antes de que su app personal estuviera disponible'
  );
end;
$$;

-- Validaciones finales. Cualquier incumplimiento aborta toda la transaccion.
do $$
begin
  if not exists(
    select 1 from public.ninja_account_ownership
    where physical_connector_id='658adc9f-8ab0-4f58-a397-c425681e0b3d'
      and connection_name='En Vivo' and account_name='2167219'
      and destination_connector_id='f6a0fd3e-02d8-43fa-8e13-4e6989d57eee'
      and owner_user_id='ffabc050-c33c-47e5-8011-14404e5ee2d5'
  ) then raise exception 'Final ownership validation failed'; end if;

  if (select count(*) from public.ninja_operation_probe_sessions
      where id=any(array[161909,162077,162078,162079,162099]::bigint[])
        and connector_id='658adc9f-8ab0-4f58-a397-c425681e0b3d'
        and excluded_at is not null)<>5
  then raise exception 'Final session validation failed'; end if;

  if exists(
    select 1 from public.ninja_operation_batches
    where broker_session_id=any(array[161909,162077,162078,162079,162099]::bigint[])
      and (daily_control_id is not null or accounting_status='committed')
  ) then raise exception 'A corrected session became economic unexpectedly'; end if;

  if exists(
    select 1 from public.ninja_broker_balance_states
    where connector_id='658adc9f-8ab0-4f58-a397-c425681e0b3d'
  ) then raise exception 'Alfred retained the reassigned broker state'; end if;
end;
$$;

commit;
