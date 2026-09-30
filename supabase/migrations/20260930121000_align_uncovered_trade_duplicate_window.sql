-- La confirmacion manual de un trade sin cobertura debe usar la misma ventana
-- que la deduplicacion automatica. De otro modo una observacion espejo demorada
-- podria confirmarse erroneamente como un trade broker independiente.

do $migration$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.confirm_ninja_uncovered_trade(uuid,bigint,boolean)'::regprocedure
  ) into definition;

  if pg_catalog.strpos(definition, '<=5') = 0 then
    if pg_catalog.strpos(definition, '<=15') > 0 then
      return;
    end if;

    raise exception 'No se encontro la ventana de cinco segundos para trades sin cobertura';
  end if;

  execute pg_catalog.replace(definition, '<=5', '<=15');
end;
$migration$;

comment on function public.confirm_ninja_uncovered_trade(uuid,bigint,boolean) is
  'Confirma un trade broker independiente solo si no existe una observacion tecnica equivalente dentro de la ventana de quince segundos.';
