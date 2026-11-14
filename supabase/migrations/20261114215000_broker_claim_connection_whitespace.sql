-- Preserve the exact observed connection in ownership; ignore surrounding
-- whitespace only when finding the pending observation selected by the user.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.claim_ninja_broker_account(uuid,text,text)'::regprocedure) into strict definition;
  if position('pending.connection_name=btrim(target_connection_name)' in definition) > 0 then
    definition := replace(definition,
      'pending.connection_name=btrim(target_connection_name)',
      'btrim(pending.connection_name)=btrim(target_connection_name)');
    execute definition;
  elsif position('btrim(pending.connection_name)=btrim(target_connection_name)' in definition) = 0 then
    raise exception 'BROKER_CLAIM_WHITESPACE_ANCHOR_MISSING';
  end if;
end;
$$;
