begin;

select plan(5);

select has_function(
  'public',
  'commit_ninja_automatic_operation_batch',
  array['uuid'],
  'automatic reconciliation function exists'
);

select like(
  pg_get_functiondef('public.commit_ninja_automatic_operation_batch(uuid)'::regprocedure),
  '%from public.period_opening_snapshots%',
  'first automatic trade can read the confirmed opening'
);

select like(
  pg_get_functiondef('public.commit_ninja_automatic_operation_batch(uuid)'::regprocedure),
  '%next_control_number := 1%',
  'first automatic trade creates the first broker movement'
);

select like(
  pg_get_functiondef('public.commit_ninja_automatic_operation_batch(uuid)'::regprocedure),
  '%prior_balance_cents = opening_cents%',
  'single broker still requires exact opening balance continuity'
);

select like(
  pg_get_functiondef('public.commit_ninja_automatic_operation_batch(uuid)'::regprocedure),
  '%balance_source%',
  'audit records whether continuity came from opening or a prior movement'
);

select * from finish();

rollback;
