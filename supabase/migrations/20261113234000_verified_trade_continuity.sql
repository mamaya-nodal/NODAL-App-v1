-- Continue a proven trade while retaining the pre-existing cash discrepancy.
-- Recovered history must not be appended behind later economic records or
-- silently duplicate a reconstruction with a different source key.
begin;
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.commit_ninja_automatic_operation_batch(uuid)'::regprocedure) into definition;
  if strpos(definition,'NODAL_VERIFIED_CONTINUITY_V1')=0 then
    if strpos(definition,'raise exception ''Broker opening balance no longer matches accounting'';')=0
      or strpos(definition,'source_key := ''ninja-operation:'' || broker_session.opening_event_id::text;')=0 then
      raise exception 'Unexpected automatic commit definition';
    end if;
    definition := replace(definition,
      'raise exception ''Broker opening balance no longer matches accounting'';',
      E'-- NODAL_VERIFIED_CONTINUITY_V1\n'
      || 'if broker_session.result_verified then '
      || 'accounting_closing_cents:=prior_balance_cents+selected_batch.broker_result_cents; '
      || 'received_closing_cents:=subaccount_closing_cents; '
      || 'sync_reason:=''Resultado operativo verificado; diferencia anterior pendiente de clasificación.''; '
      || 'else raise exception ''Broker opening balance no longer matches accounting''; end if;');
    definition := replace(definition,
      'source_key := ''ninja-operation:'' || broker_session.opening_event_id::text;',
      'if broker_session.result_conflict then raise exception ''NINJA_RESULT_EVIDENCE_CONFLICT''; end if; '
      || 'source_key := ''ninja-operation:'' || broker_session.opening_event_id::text; '
      || 'if not exists(select 1 from public.daily_controls c where c.period_id=selected_batch.accounting_period_id '
      || 'and c.source=''ninjatrader'' and c.source_event_key=source_key) then '
      || 'if exists(select 1 from public.ninja_operation_batches later '
      || 'join public.ninja_operation_probe_sessions s on s.id=later.broker_session_id '
      || 'join public.ninja_connectors c on c.id=later.connector_id '
      || 'join public.ninja_connectors own on own.id=selected_batch.connector_id '
      || 'where c.owner_user_id=own.owner_user_id and s.account_name=broker_session.account_name '
      || 'and later.accounting_status=''committed'' and later.opened_at>selected_batch.opened_at) then '
      || 'raise exception ''NINJA_HISTORICAL_REPLAY_REVIEW_REQUIRED''; end if; '
      || 'if exists(select 1 from public.daily_controls c where c.period_id=selected_batch.accounting_period_id '
      || 'and c.operated_on>selected_batch.operated_on) then '
      || 'raise exception ''NINJA_HISTORICAL_REPLAY_REVIEW_REQUIRED''; end if; '
      || 'if exists(select 1 from public.daily_controls c where c.period_id=selected_batch.accounting_period_id '
      || 'and c.operated_on=selected_batch.operated_on and c.operating_result_cents=selected_batch.broker_result_cents '
      || 'and (c.source<>''ninjatrader'' or coalesce(c.source_event_key,'''') !~ ''^ninja-operation:[0-9]+$'')) then '
      || 'raise exception ''NINJA_EXISTING_REPAIR_REVIEW_REQUIRED''; end if; end if;');
    execute definition;
  end if;
end $migration$;
commit;
