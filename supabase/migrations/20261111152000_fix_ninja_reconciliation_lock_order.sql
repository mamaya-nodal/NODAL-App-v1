-- Evita que dos reconstrucciones simultaneas retengan sesiones distintas
-- mientras esperan el mismo bloqueo de cuenta broker. El bloqueo comun debe
-- tomarse antes que cualquier fila mutable que participe de la conciliacion.

do $migration$
declare
  function_signature regprocedure :=
    'public.upsert_nodal_deduplicated_operation_batch(uuid,bigint,text,bigint,bigint,bigint,timestamptz,timestamptz,text,text,uuid,uuid,public.operation_phase,date,integer,integer)'::regprocedure;
  definition text;
  first_row_lock_position integer;
  advisory_lock_position integer;
  current_batch_marker text := 'select batches.* into current_batch';
  current_batch_marker_position integer;
  relock text := E'\n\n  -- NODAL_LOCK_ORDER_V2: el bloqueo comun ya esta tomado.\n  select sessions.* into selected_session\n  from public.ninja_operation_probe_sessions sessions\n  where sessions.id = target_broker_session_id\n    and sessions.connector_id = target_connector_id\n    and sessions.status = ''closed''\n    and sessions.excluded_at is null\n  for update;\n  if not found then raise exception ''Broker session is not available''; end if;';
begin
  select pg_get_functiondef(function_signature) into strict definition;

  if pg_catalog.strpos(definition, 'NODAL_LOCK_ORDER_V2') > 0 then
    return;
  end if;

  first_row_lock_position := pg_catalog.strpos(definition, '  for update;');
  advisory_lock_position := pg_catalog.strpos(definition, 'pg_advisory_xact_lock');
  current_batch_marker_position := pg_catalog.strpos(definition, current_batch_marker);

  if first_row_lock_position = 0
    or advisory_lock_position = 0
    or first_row_lock_position > advisory_lock_position
    or current_batch_marker_position = 0
    or current_batch_marker_position < advisory_lock_position then
    raise exception 'Unexpected NINJA reconciliation lock structure';
  end if;

  -- La primera lectura valida la sesion y obtiene la clave de serializacion,
  -- pero no retiene una fila mientras espera el advisory lock.
  definition := overlay(
    definition placing '  ;'
    from first_row_lock_position for pg_catalog.length('  for update;')
  );

  current_batch_marker_position := pg_catalog.strpos(definition, current_batch_marker);
  definition := overlay(
    definition placing relock || E'\n  ' || current_batch_marker
    from current_batch_marker_position for pg_catalog.length(current_batch_marker)
  );

  execute definition;
end;
$migration$;

comment on function public.upsert_nodal_deduplicated_operation_batch(
  uuid,bigint,text,bigint,bigint,bigint,timestamptz,timestamptz,text,text,
  uuid,uuid,public.operation_phase,date,integer,integer
) is 'Consolida observaciones broker con un orden unico de bloqueos: primero cuenta broker y despues filas de sesion/lote.';
