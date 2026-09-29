-- Run after the migration, always inside a rolled-back transaction.
begin;
do $test$
declare
  principal public.ninja_connectors%rowtype;
  result_id uuid;
  before_links jsonb;
  before_other jsonb;
  code_hash text;
  access_hash text;
  refresh_hash text;
  iteration integer;
begin
  if has_function_privilege('anon','public.redeem_ninja_pairing_code(text,text,text,timestamptz,text,timestamptz)','execute')
    or has_function_privilege('authenticated','public.redeem_ninja_pairing_code(text,text,text,timestamptz,text,timestamptz)','execute')
  then raise exception 'Pairing exposed to untrusted roles'; end if;
  select c.* into strict principal from public.ninja_connectors c
  join public.nodal_users u on u.id=c.owner_user_id
  where c.status='active' and c.identity_id is null and u.access_state='active'
  order by c.paired_at desc limit 1;
  select jsonb_agg(to_jsonb(l) order by l.id) into before_links
  from public.ninja_account_links l where l.connector_id=principal.id;
  select jsonb_agg(to_jsonb(c) order by c.id) into before_other
  from public.ninja_connectors c where c.id<>principal.id;
  for iteration in 1..3 loop
    code_hash:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
    access_hash:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
    refresh_hash:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
    if iteration=3 then
      update public.ninja_connectors set status='revoked',revoked_at=now() where id=principal.id;
    end if;
    insert into public.ninja_pairing_codes(owner_user_id,code_hash,expires_at)
    values(principal.owner_user_id,code_hash,now()+interval '5 minutes');
    select connector_id into result_id from public.redeem_ninja_pairing_code(
      code_hash,'0.5',access_hash,now()+interval '10 minutes',refresh_hash,now()+interval '90 days');
    if result_id<>principal.id then raise exception 'Re-pairing changed logical connector'; end if;
    if exists(select 1 from public.authenticate_ninja_connector_access(principal.access_token_hash))
    then raise exception 'Old installation still authorized'; end if;
    if not exists(select 1 from public.authenticate_ninja_connector_access(access_hash))
    then raise exception 'Replacement cannot authenticate'; end if;
    begin
      perform public.redeem_ninja_pairing_code(code_hash,'0.5',access_hash,now()+interval '10 minutes',refresh_hash,now()+interval '90 days');
      raise exception 'Consumed code accepted';
    exception when others then
      if sqlerrm<>'Pairing code is invalid or expired' then raise; end if;
    end;
  end loop;
  if before_links is distinct from (select jsonb_agg(to_jsonb(l) order by l.id) from public.ninja_account_links l where l.connector_id=principal.id)
  then raise exception 'Account links changed'; end if;
  if before_other is distinct from (select jsonb_agg(to_jsonb(c) order by c.id) from public.ninja_connectors c where c.id<>principal.id)
  then raise exception 'Another user or identity changed'; end if;
end;
$test$;
select 'PASS: active/revoked re-pairing preserves ID, links and other scopes; old secrets and consumed codes rejected' as regression;
rollback;
