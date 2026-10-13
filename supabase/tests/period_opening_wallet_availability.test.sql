begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select has_function(
  'public',
  'open_nodal_period_after_opening_confirmation',
  array[]::text[],
  'confirmed openings have a period lifecycle handler'
);

select trigger_is(
  'public',
  'period_opening_snapshots',
  'period_opening_snapshots_open_period',
  'public',
  'open_nodal_period_after_opening_confirmation',
  'opening confirmation activates the initial period'
);

select like(
  pg_get_functiondef('public.open_nodal_period_after_opening_confirmation()'::regprocedure),
  $$%lifecycle_status = 'open'%$$,
  'the lifecycle handler opens a scheduled period'
);

select like(
  pg_get_functiondef('public.create_nodal_wallet(uuid,text,bigint,date)'::regprocedure),
  $$%periods.lifecycle_status = 'open'%$$,
  'wallet creation uses the current open period'
);

select like(
  pg_get_functiondef('public.create_nodal_wallet(uuid,text,bigint,date)'::regprocedure),
  '%nodal_date_belongs_to_period%',
  'wallet creation accepts every business date in the open period'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.create_nodal_wallet(uuid,text,bigint,date)',
    'EXECUTE'
  ),
  true,
  'authenticated users can add their own wallets'
);

select * from finish();

rollback;
