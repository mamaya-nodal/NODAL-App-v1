begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select has_function(
  'public',
  'revoke_ninja_access_with_nodal_user',
  array[]::text[],
  'the connector revocation trigger function exists'
);

select is(
  (
    select count(*)::integer
    from pg_trigger
    where tgrelid = 'public.nodal_users'::regclass
      and tgname = 'nodal_users_revoke_ninja_access'
      and not tgisinternal
  ),
  1,
  'nodal user access changes execute the connector revocation trigger'
);

select like(
  pg_get_functiondef('public.revoke_ninja_access_with_nodal_user()'::regprocedure),
  '%connectors.status = ''active''%',
  'only active connectors are revoked'
);

select like(
  pg_get_functiondef('public.revoke_ninja_access_with_nodal_user()'::regprocedure),
  '%codes.consumed_at is null%',
  'pending pairing codes are expired with the user access'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.revoke_ninja_access_with_nodal_user()',
    'EXECUTE'
  ),
  false,
  'clients cannot invoke the security-definer trigger directly'
);

select * from finish();

rollback;
