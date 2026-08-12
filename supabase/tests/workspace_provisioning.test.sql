begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select is(
  has_function_privilege(
    'anon',
    'public.provision_nodal_user_foundation(text,date,text)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot provision workspaces'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.provision_nodal_user_foundation(text,date,text)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot provision workspaces'
);

select is(
  has_function_privilege(
    'service_role',
    'public.provision_nodal_user_foundation(text,date,text)',
    'EXECUTE'
  ),
  true,
  'the privileged server role can provision workspaces'
);

select is(
  (
    select tables.relrowsecurity
    from pg_class as tables
    where tables.oid = 'public.workspace_provisioning_events'::regclass
  ),
  true,
  'workspace provisioning audit events have RLS enabled'
);

select * from finish();

rollback;
