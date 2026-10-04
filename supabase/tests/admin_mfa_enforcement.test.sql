begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select function_returns(
  'public',
  'is_current_user_admin',
  array[]::text[],
  'boolean',
  'administrator check remains a boolean database boundary'
);

select is(
  has_function_privilege('anon', 'public.is_current_user_admin()', 'EXECUTE'),
  false,
  'anonymous users cannot execute the administrator check'
);

select is(
  has_function_privilege('authenticated', 'public.is_current_user_admin()', 'EXECUTE'),
  true,
  'authenticated sessions can be evaluated by the administrator boundary'
);

select like(
  pg_get_functiondef('public.is_current_user_admin()'::regprocedure),
  '%''aal2''%',
  'administrator boundary requires an AAL2 claim'
);

select * from finish();

rollback;
