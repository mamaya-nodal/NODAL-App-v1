-- Corrige la cuenta de claves JSON en la función ya aplicada al entorno remoto.
-- En una instalación nueva, la migración anterior ya contiene la expresión final.

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.correct_nodal_daily_control_balance_with_allocations(uuid,uuid,bigint,text,jsonb)'::regprocedure
  ) into function_definition;

  if position('jsonb_object_length(target_custom_allocations)' in function_definition) > 0 then
    function_definition := replace(
      function_definition,
      'jsonb_object_length(target_custom_allocations)',
      '(select count(*) from jsonb_object_keys(target_custom_allocations))'
    );
    execute function_definition;
  end if;
end;
$$;
