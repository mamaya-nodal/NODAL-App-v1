begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select has_function(
  'public',
  'retire_nodal_identity',
  array['uuid'],
  'users can request the audited retirement of one identity'
);

select is(
  has_function_privilege('anon', 'public.retire_nodal_identity(uuid)', 'EXECUTE'),
  false,
  'anonymous users cannot retire identities'
);

select is(
  has_function_privilege('authenticated', 'public.retire_nodal_identity(uuid)', 'EXECUTE'),
  true,
  'authenticated calls reach the function, which verifies workspace ownership'
);

select like(
  pg_get_functiondef('public.retire_nodal_identity(uuid)'::regprocedure),
  '%can_access_workspace%',
  'retirement verifies workspace authorization in the database'
);

select like(
  pg_get_functiondef('public.retire_nodal_identity(uuid)'::regprocedure),
  '%Identity has active account assignments%',
  'retirement blocks identities with active account assignments'
);

select like(
  pg_get_functiondef('public.retire_nodal_identity(uuid)'::regprocedure),
  $$%onboarding_status = 'inactive'%$$,
  'retirement is reversible and preserves the identity row'
);

select like(
  pg_get_functiondef('public.retire_nodal_identity(uuid)'::regprocedure),
  '%identity_retired%',
  'retirement records an audit event'
);

select * from finish();

rollback;
