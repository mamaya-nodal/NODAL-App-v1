begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select is(
  has_function_privilege(
    'anon',
    'public.admin_save_nodal_unit(uuid,text,text,text,text,integer,date,text)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot create or edit NODAL units'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.admin_save_nodal_unit(uuid,text,text,text,text,integer,date,text)',
    'EXECUTE'
  ),
  true,
  'authenticated requests reach the function, which verifies Admin Master internally'
);

select col_not_null('public', 'nodal_units', 'responsible_name', 'unit responsible name is required');
select col_not_null('public', 'nodal_units', 'responsible_email', 'unit responsible email is required');
select col_not_null('public', 'nodal_units', 'agreement_bps', 'unit agreement is required');

select ok(
  (
    select constraints.condeferrable
    from pg_constraint as constraints
    where constraints.conname = 'nodal_units_root_desk_id_fkey'
  ),
  'unit to Main Desk constraint is deferrable for atomic creation'
);

select ok(
  (
    select constraints.condeferrable
    from pg_constraint as constraints
    where constraints.conname = 'nodal_desks_unit_id_fkey'
  ),
  'Main Desk to unit constraint is deferrable for atomic creation'
);

select * from finish();

rollback;
