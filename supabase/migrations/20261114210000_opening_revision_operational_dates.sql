-- Revisions must accept the same operational date interval as first openings.
-- A period may span calendar months.
do $$
declare
  definition text;
  old_condition text := 'date_trunc(''month'', target_cutover_date)::date <> selected_month';
  new_condition text := 'not exists (select 1 from public.periods opening_period where opening_period.id = target_period_id and opening_period.operational_start_on is not null and opening_period.scheduled_close_at is not null and target_cutover_date >= opening_period.operational_start_on and target_cutover_date <= opening_period.scheduled_close_at::date)';
begin
  select pg_get_functiondef(oid) into strict definition
  from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname = 'revise_nodal_period_opening';
  if position(new_condition in definition) > 0 then return; end if;
  if position(old_condition in definition) = 0 then
    raise exception 'OPENING_REVISION_DATE_PATCH_ANCHOR_MISSING';
  end if;
  execute replace(definition, old_condition, new_condition);
end;
$$;
