begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select is(
  has_function_privilege(
    'anon',
    'public.admin_authorize_and_provision_nodal_user(text,text,date,text)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot authorize or provision students'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.admin_authorize_and_provision_nodal_user(text,text,date,text)',
    'EXECUTE'
  ),
  true,
  'authenticated requests reach the function, which verifies the administrator role internally'
);

select is(
  has_function_privilege(
    'anon',
    'public.admin_revoke_nodal_student(uuid,text)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot revoke a student'
);

select is(
  (
    select tables.relrowsecurity
    from pg_class as tables
    where tables.oid = 'public.access_authorization_events'::regclass
  ),
  true,
  'access authorization audit remains protected by RLS'
);

select is(
  (
    select tables.relrowsecurity
    from pg_class as tables
    where tables.oid = 'public.workspace_provisioning_events'::regclass
  ),
  true,
  'workspace provisioning audit remains protected by RLS'
);

select * from finish();

rollback;
