-- La observacion de una misma subcuenta broker puede llegar desde distintos
-- Ninja con mas de cinco segundos de diferencia. Los demas campos tecnicos
-- (cuenta, instrumento, direccion, cantidad y resultado) deben seguir
-- coincidiendo exactamente; solo se amplia la tolerancia temporal a 15 s.

do $migration$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.upsert_nodal_deduplicated_operation_batch(uuid,bigint,text,bigint,bigint,bigint,timestamptz,timestamptz,text,text,uuid,uuid,public.operation_phase,date,integer,integer)'::regprocedure
  ) into definition;

  if pg_catalog.strpos(definition, '<= 5') = 0 then
    if pg_catalog.strpos(definition, '<= 15') > 0 then
      return;
    end if;

    raise exception 'No se encontro la ventana activa de cinco segundos';
  end if;

  execute pg_catalog.replace(definition, '<= 5', '<= 15');
end;
$migration$;

comment on function public.upsert_nodal_deduplicated_operation_batch(
  uuid,bigint,text,bigint,bigint,bigint,timestamptz,timestamptz,text,text,
  uuid,uuid,public.operation_phase,date,integer,integer
) is 'Consolida observaciones de una misma operacion broker entre conectores del mismo titular. Exige coincidencia tecnica exacta y admite hasta quince segundos de diferencia entre aperturas.';
