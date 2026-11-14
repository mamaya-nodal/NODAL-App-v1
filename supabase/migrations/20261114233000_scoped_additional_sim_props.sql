-- Extend only the existing authorized, expiring personal rehearsal.
do $$
declare definition text; old_guard text := 'upper(btrim(target_external_account_name))=''SIM101''';
  new_guard text := 'upper(btrim(target_external_account_name)) in (''SIM101'',''SIMPROP1'',''SIMPROP2'',''SIMPROP 2'')';
begin
  select pg_get_functiondef(oid) into strict definition from pg_proc
  where pronamespace='public'::regnamespace and proname='create_nodal_detected_purchase';
  if position('AUTHORIZED_SIM_REHEARSAL_20261114' in definition)=0 then
    raise exception 'AUTHORIZED_REHEARSAL_GUARD_MISSING';
  end if;
  if position(new_guard in definition)>0 then return; end if;
  if position(old_guard in definition)=0 then raise exception 'ADDITIONAL_SIM_PROP_ANCHOR_MISSING'; end if;
  execute replace(definition,old_guard,new_guard);
end;
$$;
