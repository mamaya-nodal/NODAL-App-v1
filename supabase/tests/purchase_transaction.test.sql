begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

select is(
  has_function_privilege(
    'anon',
    'public.create_nodal_purchase(uuid,uuid,bigint,public.purchase_funds_origin)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot create purchases'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.create_nodal_purchase(uuid,uuid,bigint,public.purchase_funds_origin)',
    'EXECUTE'
  ),
  true,
  'authenticated users can call the validated purchase transaction'
);

select is(
  has_table_privilege('authenticated', 'public.purchases', 'INSERT'),
  false,
  'authenticated users still cannot insert purchases directly'
);

select * from finish();

rollback;
