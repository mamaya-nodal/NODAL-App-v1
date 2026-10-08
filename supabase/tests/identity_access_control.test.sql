begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'nodal_users' and column_name = 'identities_enabled'),
  'false',
  'new NODAL users start with Identidades disabled'
);

select has_function(
  'public',
  'admin_update_nodal_user_access',
  array['uuid', 'text', 'integer', 'boolean'],
  'Admin Master can update role, desk and identity access atomically'
);

select is(
  has_function_privilege('anon', 'public.admin_update_nodal_user_access(uuid,text,integer,boolean)', 'EXECUTE'),
  false,
  'anonymous users cannot grant identity access'
);

select is(
  has_function_privilege('authenticated', 'public.admin_update_nodal_user_access(uuid,text,integer,boolean)', 'EXECUTE'),
  true,
  'authenticated calls reach the function, which verifies Admin Master internally'
);

select like(
  pg_get_functiondef('public.admin_update_nodal_user_access(uuid,text,integer,boolean)'::regprocedure),
  '%admin_update_nodal_user_role%',
  'role and identity access share one database transaction'
);

select like(
  pg_get_functiondef('public.admin_update_nodal_user_access(uuid,text,integer,boolean)'::regprocedure),
  '%identities_access_updated%',
  'identity access changes are recorded in management history'
);

select * from finish();

rollback;
