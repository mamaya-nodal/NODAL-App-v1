-- Mantiene alineada la RPC activa con la ventana de deduplicación de cinco
-- segundos usada para observaciones de una misma cobertura desde conectores
-- distintos del mismo titular.

do $migration$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.upsert_nodal_deduplicated_operation_batch(uuid,bigint,text,bigint,bigint,bigint,timestamptz,timestamptz,text,text,uuid,uuid,public.operation_phase,date,integer,integer)'::regprocedure
  ) into definition;

  if pg_catalog.strpos(definition, '<= 2.5') = 0 then
    if pg_catalog.strpos(definition, '<= 5') > 0 then
      return;
    end if;

    raise exception 'No se encontró la ventana activa de 2.5 segundos';
  end if;

  execute pg_catalog.replace(definition, '<= 2.5', '<= 5');
end;
$migration$;
