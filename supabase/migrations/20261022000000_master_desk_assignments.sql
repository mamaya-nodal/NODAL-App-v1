-- Admin Master already has global desk-management authority. Permit the existing
-- audited assignment transaction when the master has no personal child desk.
do $migration$
declare
  signature regprocedure := 'public.desk_admin_save_user_v2(uuid,text,text,boolean,integer,boolean,integer,uuid[],uuid,uuid)'::regprocedure;
  definition text;
  old_guard text := 'if actor_id is null or actor_desk is null then raise exception ''DESK_ADMIN_REQUIRED''; end if;';
  new_guard text := 'if actor_id is null then raise exception ''DESK_ADMIN_REQUIRED''; end if;
  if actor_desk is null and public.is_current_user_admin() then
    actor_desk := ''00000000-0000-4000-8000-000000000001''::uuid;
  end if;
  if actor_desk is null then raise exception ''DESK_ADMIN_REQUIRED''; end if;';
begin
  definition := pg_get_functiondef(signature);
  if position(new_guard in definition) > 0 then return; end if;
  if position(old_guard in definition) = 0 then
    raise exception 'Unexpected desk assignment function: review migration before applying';
  end if;
  execute replace(definition, old_guard, new_guard);
end;
$migration$;
