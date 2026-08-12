begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select is(
  has_function_privilege(
    'anon',
    'public.authorize_nodal_user_by_email(text,text,text)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot authorize NODAL access'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.authorize_nodal_user_by_email(text,text,text)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot authorize NODAL access'
);

select is(
  has_function_privilege(
    'service_role',
    'public.authorize_nodal_user_by_email(text,text,text)',
    'EXECUTE'
  ),
  true,
  'the privileged server role can authorize NODAL access'
);

select is(
  (
    select tables.relrowsecurity
    from pg_class as tables
    where tables.oid = 'public.access_authorization_events'::regclass
  ),
  true,
  'authorization audit events have RLS enabled'
);

select * from finish();

rollback;
