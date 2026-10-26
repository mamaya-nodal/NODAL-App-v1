begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'nodal_users' and column_name = 'configuration_enabled'),
  'false',
  'new NODAL users start with Configuracion disabled'
);

select has_function(
  'public',
  'admin_update_nodal_user_access',
  array['uuid', 'text', 'integer', 'boolean', 'boolean'],
  'Admin Master updates role and both optional capabilities atomically'
);

select is(
  has_function_privilege('anon', 'public.admin_update_nodal_user_access(uuid,text,integer,boolean,boolean)', 'EXECUTE'),
  false,
  'anonymous users cannot grant Configuracion access'
);

select is(
  has_function_privilege('authenticated', 'public.admin_update_nodal_user_access(uuid,text,integer,boolean,boolean)', 'EXECUTE'),
  true,
  'authenticated calls reach the function that verifies Admin Master internally'
);

select ok(
  pg_get_functiondef('public.admin_update_nodal_user_access(uuid,text,integer,boolean,boolean)'::regprocedure)
    like '%admin_update_nodal_user_role%',
  'role and capabilities share one database transaction'
);

select ok(
  pg_get_functiondef('public.admin_update_nodal_user_access(uuid,text,integer,boolean,boolean)'::regprocedure)
    like '%user_capabilities_updated%',
  'capability changes are recorded in management history'
);

select ok(
  pg_get_functiondef('public.admin_update_nodal_user_access(uuid,text,integer,boolean,boolean)'::regprocedure)
    like '%insert into public.addon_entitlements%',
  'enabling Configuracion grants the MIMICAL entitlement'
);

select ok(
  pg_get_functiondef('public.admin_update_nodal_user_access(uuid,text,integer,boolean,boolean)'::regprocedure)
    like '%update public.addon_installations%',
  'disabling Configuracion revokes add-on installations'
);

select * from finish();

rollback;
