-- Run transactionally; never keep these fixtures.
begin;
do $$
declare actor uuid; space uuid; period uuid; wallet uuid := gen_random_uuid(); destination uuid := gen_random_uuid();
  token uuid; evidence uuid; movement uuid; observed jsonb; rejected boolean;
begin
  select w.owner_user_id,w.id,p.id into actor,space,period from public.workspaces w
    join public.periods p on p.workspace_id=w.id join public.nodal_users u on u.id=w.owner_user_id
    where w.modality='real' and p.lifecycle_status='open' and u.access_state='active' limit 1;
  if actor is null then raise exception 'Needs active development user and open real period'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  insert into public.nodal_wallets(id,workspace_id,name,created_by) values(wallet,space,'Test wallet '||wallet,actor),(destination,space,'Test wallet '||destination,actor);
  perform public.configure_nodal_wallet_source(wallet,null,'0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  if (select address from public.nodal_wallet_sources where wallet_id=wallet) <> '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' then raise exception 'Normalization failed'; end if;
  rejected := false;
  begin perform public.configure_nodal_wallet_source(destination,null,'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'); exception when unique_violation then rejected := true; end;
  if not rejected then raise exception 'Duplicate address accepted'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  rejected := false;
  begin perform public.configure_nodal_wallet_source(wallet,null,null); exception when others then rejected := true; end;
  if not rejected then raise exception 'Unauthorized configuration accepted'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  update public.nodal_wallet_sources set started_at=now()-interval '1 hour' where wallet_id=wallet;
  token := public.claim_nodal_wallet_sync(wallet);
  if token is null or public.claim_nodal_wallet_sync(wallet) is not null then raise exception 'Lease failed'; end if;
  observed := jsonb_build_array(jsonb_build_object('chain','eth','tx_hash','0x'||repeat('c',64),'log_index',0,
    'token_address','0xdac17f958d2ee523a2206206994597c13d831ec7','symbol','USDT','raw_amount','100000000','amount_cents',10000,
    'direction','in','occurred_at',now()-interval '10 minutes','from_address','0x'||repeat('b',40),'to_address','0x'||repeat('a',40)));
  perform public.complete_nodal_wallet_sync(wallet,token,now()-interval '5 minutes',10000,'[]',observed);
  if public.calculate_nodal_wallet_balance(wallet) <> 0 then raise exception 'Observation changed ledger'; end if;
  select id into evidence from public.nodal_wallet_observations where wallet_id=wallet;
  update public.nodal_wallet_sources set lease_until=null where wallet_id=wallet;
  token := public.claim_nodal_wallet_sync(wallet);
  perform public.complete_nodal_wallet_sync(wallet,token,now()-interval '5 minutes',10000,'[]',observed);
  if (select count(*) from public.nodal_wallet_observations where wallet_id=wallet) <> 1 then raise exception 'Duplicate observation'; end if;
  -- Direct fixture insert, not a user balance correction.
  insert into public.wallet_movements(period_id,wallet_id,occurred_on,kind,amount_cents,fee_cents,created_by,updated_by)
    values(period,wallet,((now()-interval '10 minutes') at time zone 'America/Argentina/Buenos_Aires')::date,'external_contribution',10000,0,actor,actor) returning id into movement;
  perform public.link_nodal_wallet_observation(evidence,movement,null);
  perform public.link_nodal_wallet_observation(evidence,movement,null);
  if public.calculate_nodal_wallet_balance(wallet) <> 10000 then raise exception 'Link duplicated balance'; end if;
  if has_function_privilege('authenticated','public.complete_nodal_wallet_sync(uuid,uuid,timestamptz,bigint,jsonb,jsonb)','EXECUTE') then raise exception 'Sync privilege leak'; end if;
  if has_table_privilege('authenticated','public.nodal_wallet_observations','INSERT') then raise exception 'Direct writes permitted'; end if;
end; $$;
rollback;
