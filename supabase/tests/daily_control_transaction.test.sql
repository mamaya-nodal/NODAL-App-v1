begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

select is(
  has_function_privilege(
    'anon',
    'public.confirm_nodal_daily_control(uuid,public.daily_control_kind,date,uuid,bigint,bigint,public.daily_control_origin_destination,uuid,uuid,uuid[],public.operation_phase,text,public.daily_control_source,text,bigint,text)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot confirm daily control'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.confirm_nodal_daily_control(uuid,public.daily_control_kind,date,uuid,bigint,bigint,public.daily_control_origin_destination,uuid,uuid,uuid[],public.operation_phase,text,public.daily_control_source,text,bigint,text)',
    'EXECUTE'
  ),
  true,
  'authenticated users can call the validated transaction'
);

select is(
  has_function_privilege(
    'anon',
    'public.correct_nodal_daily_control_balance(uuid,uuid,bigint,text)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot correct daily control'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.correct_nodal_daily_control_balance(uuid,uuid,bigint,text)',
    'EXECUTE'
  ),
  true,
  'authenticated users can call the validated correction transaction'
);

select is(has_table_privilege('authenticated', 'public.daily_controls', 'INSERT'), false,
  'authenticated cannot insert daily controls directly');
select is(has_table_privilege('authenticated', 'public.daily_control_participants', 'INSERT'), false,
  'authenticated cannot insert participants directly');
select is(has_table_privilege('authenticated', 'public.operation_entries', 'INSERT'), false,
  'authenticated cannot insert operation entries directly');

select is(
  (select relrowsecurity from pg_class where oid = 'public.daily_controls'::regclass),
  true,
  'daily controls have row level security'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.daily_control_participants'::regclass),
  true,
  'participants have row level security'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.operation_entries'::regclass),
  true,
  'operation entries have row level security'
);

select * from finish();

rollback;
