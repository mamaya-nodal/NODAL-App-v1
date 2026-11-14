-- Reviews already normalize external whitespace; links preserve the observed
-- label to match original execution telemetry. Compare both trimmed in guard.
do $$
declare definition text; patched text;
begin
  select pg_get_functiondef('public.enforce_approved_ninja_account_link()'::regprocedure) into strict definition;
  patched:=regexp_replace(definition,'reviews[.]connection_name[[:space:]]*=[[:space:]]*new[.]connection_name',
    'btrim(reviews.connection_name) = btrim(new.connection_name)','g');
  if patched=definition and position('btrim(reviews.connection_name) = btrim(new.connection_name)' in definition)=0 then
    raise exception 'LINK_CONNECTION_WHITESPACE_ANCHOR_MISSING';
  end if;
  execute patched;
end;
$$;
