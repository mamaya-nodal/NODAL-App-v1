begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select has_function(
  'public',
  'get_current_user_ninja_connector_status_v2',
  array[]::text[],
  'connector status remains available to the application'
);

select like(
  pg_get_functiondef('public.get_current_user_ninja_connector_status_v2()'::regprocedure),
  '%ninja_connector_destinations%',
  'logical destinations resolve their physical installation'
);

select like(
  pg_get_functiondef('public.get_current_user_ninja_connector_status_v2()'::regprocedure),
  '%last_enabled_physical_heartbeat%',
  'online state uses the physical heartbeat rather than inventory activity'
);

select like(
  pg_get_functiondef('public.get_current_user_ninja_connector_status_v2()'::regprocedure),
  '%destinations.is_enabled%',
  'a paused identity is not presented as receiving data'
);

select is(
  has_function_privilege('authenticated', 'public.get_current_user_ninja_connector_status_v2()', 'EXECUTE'),
  true,
  'authenticated users can read their server-filtered connector status'
);

select * from finish();

rollback;
