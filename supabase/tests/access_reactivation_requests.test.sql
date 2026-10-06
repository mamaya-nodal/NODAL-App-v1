begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select has_function(
  'public',
  'capture_nodal_access_request',
  array[]::text[],
  'the authentication trigger function exists'
);

select like(
  pg_get_functiondef('public.capture_nodal_access_request()'::regprocedure),
  '%previous_profile.access_state = ''revoked''%',
  'revoked profiles can request reactivation on a later sign-in'
);

select like(
  pg_get_functiondef('public.capture_nodal_access_request()'::regprocedure),
  '%access_role = ''student''%',
  'reactivation never restores a previous administrator role'
);

select is(
  has_function_privilege('authenticated', 'public.capture_nodal_access_request()', 'EXECUTE'),
  false,
  'clients cannot invoke the authentication trigger directly'
);

select * from finish();

rollback;
