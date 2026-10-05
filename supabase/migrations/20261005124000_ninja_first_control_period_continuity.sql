-- The first Ninja operation of a new accounting period continues from the
-- latest confirmed control in the preceding period. Technical sessions are
-- never used as ledger continuity.

begin;

do $$
declare
  definition text;
  original_definition text;
  lookup_pattern text := 'select[[:space:]]+\*[[:space:]]+into[[:space:]]+prior_control[[:space:]]+from[[:space:]]+public\.daily_controls[[:space:]]+controls[[:space:]]+where[[:space:]]+controls\.period_id[[:space:]]*=[[:space:]]*selected_batch\.accounting_period_id[[:space:]]+order[[:space:]]+by[[:space:]]+controls\.control_number[[:space:]]+desc[[:space:]]+limit[[:space:]]+1[[:space:]]+for[[:space:]]+update;[[:space:]]+if[[:space:]]+not[[:space:]]+found[[:space:]]+then[[:space:]]+raise[[:space:]]+exception[[:space:]]+''Broker opening balance is missing'';[[:space:]]+end[[:space:]]+if;';
  continuous_lookup text := E'select * into prior_control\n  from public.daily_controls controls\n  where controls.period_id = selected_batch.accounting_period_id\n  order by controls.control_number desc\n  limit 1\n  for update;\n  if not found then\n    select controls.* into prior_control\n    from public.periods current_period\n    join public.periods earlier_period\n      on earlier_period.workspace_id = current_period.workspace_id\n      and earlier_period.period_month < current_period.period_month\n    join public.daily_controls controls on controls.period_id = earlier_period.id\n    where current_period.id = selected_batch.accounting_period_id\n    order by earlier_period.period_month desc, controls.control_number desc\n    limit 1\n    for update of controls;\n  end if;\n  if not found then raise exception ''Broker opening balance is missing''; end if;';
  counter_marker text := 'next_control_number := prior_control.control_number + 1;';
  counter_replacement text := E'select coalesce(max(controls.control_number), 0) + 1\n  into next_control_number\n  from public.daily_controls controls\n  where controls.period_id = selected_batch.accounting_period_id;';
begin
  select pg_get_functiondef('public.commit_ninja_automatic_operation_batch(uuid)'::regprocedure)
  into definition;
  original_definition := definition;
  definition := regexp_replace(definition, lookup_pattern, continuous_lookup);
  if definition = original_definition then
    raise exception 'Unexpected automatic Ninja prior-control lookup';
  end if;
  if strpos(definition, counter_marker) = 0 then
    raise exception 'Unexpected automatic Ninja control counter';
  end if;
  definition := replace(definition, counter_marker, counter_replacement);
  execute definition;
end $$;

do $$
declare
  definition text;
  original_definition text;
  lookup_pattern text := 'select[[:space:]]+\*[[:space:]]+into[[:space:]]+prior[[:space:]]+from[[:space:]]+public\.daily_controls[[:space:]]+where[[:space:]]+period_id[[:space:]]*=[[:space:]]*pid[[:space:]]+order[[:space:]]+by[[:space:]]+control_number[[:space:]]+desc[[:space:]]+limit[[:space:]]+1[[:space:]]+for[[:space:]]+update;[[:space:]]+if[[:space:]]+not[[:space:]]+found[[:space:]]+then[[:space:]]+raise[[:space:]]+exception[[:space:]]+''Broker opening balance missing'';[[:space:]]+end[[:space:]]+if;';
  continuous_lookup text := E'select * into prior from public.daily_controls where period_id=pid order by control_number desc limit 1 for update;\n  if not found then\n    select controls.* into prior\n    from public.periods current_period\n    join public.periods earlier_period\n      on earlier_period.workspace_id = current_period.workspace_id\n      and earlier_period.period_month < current_period.period_month\n    join public.daily_controls controls on controls.period_id = earlier_period.id\n    where current_period.id = pid\n    order by earlier_period.period_month desc, controls.control_number desc\n    limit 1\n    for update of controls;\n  end if;\n  if not found then raise exception ''Broker opening balance missing''; end if;';
  counter_marker text := 'values(pid,prior.control_number+1,opdate';
  counter_replacement text := 'values(pid,(select coalesce(max(control_number),0)+1 from public.daily_controls where period_id=pid),opdate';
begin
  select pg_get_functiondef('public.confirm_ninja_uncovered_trade(uuid,bigint,boolean)'::regprocedure)
  into definition;
  original_definition := definition;
  definition := regexp_replace(definition, lookup_pattern, continuous_lookup);
  if definition = original_definition then
    raise exception 'Unexpected uncovered Ninja prior-control lookup';
  end if;
  if strpos(definition, counter_marker) = 0 then
    raise exception 'Unexpected uncovered Ninja control counter';
  end if;
  definition := replace(definition, counter_marker, counter_replacement);
  execute definition;
end $$;

commit;

