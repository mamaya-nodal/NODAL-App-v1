begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_function(
  'public',
  'admin_update_nodal_user_role',
  array['uuid', 'text', 'integer'],
  'Admin Master role mutation exists'
);

select is(
  has_function_privilege('anon', 'public.admin_update_nodal_user_role(uuid,text,integer)', 'EXECUTE'),
  false,
  'anonymous users cannot change NODAL roles'
);

select is(
  has_function_privilege('authenticated', 'public.admin_update_nodal_user_role(uuid,text,integer)', 'EXECUTE'),
  true,
  'authenticated calls reach the function, which verifies Admin Master internally'
);

select like(
  pg_get_functiondef('public.admin_update_nodal_user_role(uuid,text,integer)'::regprocedure),
  '%ADMIN_HAS_DEPENDENCIES%',
  'an Admin cannot be removed while their branch still depends on the desk'
);

select like(
  pg_get_functiondef('public.admin_update_nodal_user_role(uuid,text,integer)'::regprocedure),
  '%SELF_MASTER_REMOVAL_FORBIDDEN%',
  'Admin Master cannot remove their own global access'
);

select like(
  pg_get_functiondef('public.admin_update_nodal_user_role(uuid,text,integer)'::regprocedure),
  $$%when 'user' then 1%$$,
  'Usuario maps deterministically to level 1'
);

select like(
  pg_get_functiondef('public.admin_update_nodal_user_role(uuid,text,integer)'::regprocedure),
  $$%when 'admin' then 2%$$,
  'Admin maps deterministically to level 2'
);

select like(
  pg_get_functiondef('public.admin_update_nodal_user_role(uuid,text,integer)'::regprocedure),
  $$%when 'admin_master' then 3%$$,
  'Admin Master maps deterministically to level 3'
);

select * from finish();

rollback;
