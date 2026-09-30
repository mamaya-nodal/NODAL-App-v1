-- Run after the migration in a transaction and always ROLLBACK.
begin;
do $$
declare fixture_identity_id uuid; actor_id uuid; first_id uuid; second_id uuid;
begin
  select i.identity_id, i.created_by into strict fixture_identity_id, actor_id
  from public.identity_connector_installations i
  join public.nodal_identities n on n.id=i.identity_id and n.onboarding_status='approved'
  where i.status in ('sent','sending') and i.expires_at <= now()
  order by i.created_at desc limit 1;
  perform set_config('request.jwt.claim.sub', actor_id::text, true);
  first_id := public.create_identity_connector_installation(fixture_identity_id, repeat('a',64), now()+interval '24 hours');
  if (select count(*) from public.identity_connector_installations i
    where i.identity_id=fixture_identity_id and i.status in ('sent','sending')) <> 1 then
    raise exception 'Expired installation was not replaced';
  end if;
  second_id := public.create_identity_connector_installation(fixture_identity_id, repeat('b',64), now()+interval '24 hours');
  if first_id=second_id or (select status from public.identity_connector_installations where id=first_id)<>'failed' then
    raise exception 'Repeated resend did not supersede the pending installation';
  end if;
  if (select count(*) from public.identity_connector_installations i
    where i.identity_id=fixture_identity_id and i.status in ('sent','sending')) <> 1 then
    raise exception 'Multiple open installations';
  end if;
end $$;
rollback;
