-- Expired sent/sending rows still participate in the one-open-installation index.
-- Replace them under the existing identity row lock, not just unexpired rows.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.create_identity_connector_installation(uuid,text,timestamptz)'::regprocedure)
    into definition;
  if strpos(definition, 'and installations.expires_at > now()') = 0 then
    raise exception 'Unexpected installation function: expiry guard not found';
  end if;
  execute replace(definition, 'and installations.expires_at > now()', '');
end $$;
