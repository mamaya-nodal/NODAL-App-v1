-- A failed internal validation stays with the user instead of creating an
-- Admin Master task. Human escalation is explicit and risk escalation is
-- handled before a repair reaches this function.
create or replace function public.prepare_nodalito_repair(
  target_period_id uuid,
  target_action text,
  target_parameters jsonb
) returns uuid
language plpgsql security definer set search_path='' as $$
declare prepared_plan uuid; changes jsonb; failure text;
begin
  prepared_plan:=public.nodalito_prepare_repair_internal(target_period_id,target_action,target_parameters);
  begin
    perform public.apply_nodalito_repair(prepared_plan);
    select coalesce(jsonb_agg(jsonb_build_object(
      'table',entity_table,'key',row_key,'before',before_data,'after',after_data
    ) order by sequence),'[]')
      into changes
      from public.nodalito_repair_changes
      where plan_id=prepared_plan;
    raise exception using errcode='P0N01',message='NODALITO_VALIDATION_ROLLBACK';
  exception
    when sqlstate 'P0N01' then null;
    when others then failure:=sqlerrm;
  end;

  if failure is not null then
    update public.nodalito_repair_plans
      set status='needs_review',failure_reason=failure,case_id=null
      where id=prepared_plan;
  else
    update public.nodalito_repair_plans
      set simulation=changes
      where id=prepared_plan;
  end if;
  return prepared_plan;
end $$;

revoke all on function public.prepare_nodalito_repair(uuid,text,jsonb) from public,anon;
grant execute on function public.prepare_nodalito_repair(uuid,text,jsonb) to authenticated;
