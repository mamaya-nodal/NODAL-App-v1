begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select has_function(
  'public',
  'disable_identities_on_access_activation',
  array[]::text[],
  'access activation identity guard exists'
);

select is(
  has_function_privilege('authenticated', 'public.disable_identities_on_access_activation()', 'EXECUTE'),
  false,
  'authenticated users cannot invoke the activation guard directly'
);

select trigger_is(
  'public',
  'nodal_users',
  'disable_identities_on_access_activation',
  'public.disable_identities_on_access_activation()',
  'nodal user access transitions are guarded'
);

select like(
  pg_get_functiondef('public.disable_identities_on_access_activation()'::regprocedure),
  $$%old.access_state is distinct from 'active'%$$,
  'the guard only applies when access becomes active'
);

select like(
  pg_get_functiondef('public.disable_identities_on_access_activation()'::regprocedure),
  '%new.identities_enabled := false%',
  'activation always starts with Identidades disabled'
);

select * from finish();

rollback;
