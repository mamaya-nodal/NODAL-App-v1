begin;

select plan(4);

select has_function(
  'public',
  'get_current_user_ninja_reconciliation_details',
  array['integer'],
  'the reconciliation detail reader exists'
);

select like(
  pg_get_functiondef('public.get_current_user_ninja_reconciliation_details(integer)'::regprocedure),
  $$%periods.lifecycle_status = 'open'%$$,
  'unassigned batches use the current real opening as their cutoff'
);

select like(
  pg_get_functiondef('public.get_current_user_ninja_reconciliation_details(integer)'::regprocedure),
  '%coalesce(batch_opening.updated_at, batch_opening.created_at)%',
  'assigned batches use the confirmed opening revision of their accounting period'
);

select like(
  pg_get_functiondef('public.get_current_user_ninja_reconciliation_details(integer)'::regprocedure),
  '%batches.opened_at >= case%',
  'only reconciliations opened at or after the applicable opening are returned'
);

select * from finish();

rollback;
