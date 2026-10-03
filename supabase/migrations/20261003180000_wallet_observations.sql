-- Observations are evidence, never ledger entries. Existing balances are untouched.
create table public.nodal_wallet_sources (
  wallet_id uuid primary key references public.nodal_wallets(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  identity_id uuid,
  address text,
  started_at timestamptz not null default now(),
  synced_through timestamptz,
  observed_at timestamptz,
  last_attempted_at timestamptz,
  observed_cents bigint check(observed_cents >= 0),
  breakdown jsonb,
  last_error text,
  lease_until timestamptz,
  lease_token uuid,
  foreign key(identity_id, workspace_id) references public.nodal_identities(id, workspace_id),
  check(address is null or (address ~ '^0x[0-9a-f]{40}$' and address <> '0x0000000000000000000000000000000000000000')),
  unique(workspace_id, address)
);
create table public.nodal_wallet_observations (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.nodal_wallet_sources(wallet_id),
  chain text not null,
  tx_hash text not null,
  log_index integer not null check(log_index >= 0),
  token_address text not null,
  symbol text not null check(symbol in ('USDT','USDC','USDT0')),
  raw_amount text not null check(raw_amount ~ '^[0-9]+$'),
  amount_cents bigint not null check(amount_cents >= 0),
  direction text not null check(direction in ('in','out','self')),
  occurred_at timestamptz not null,
  from_address text not null,
  to_address text not null,
  movement_id uuid references public.wallet_movements(id),
  payout_id uuid references public.funding_withdrawals(id),
  linked_by uuid references auth.users(id),
  linked_at timestamptz,
  check(num_nonnulls(movement_id,payout_id) <= 1),
  unique(wallet_id,chain,tx_hash,log_index)
);
-- One transfer has two legitimate legs, but never two links for the same wallet.
create unique index wallet_observation_movement on public.nodal_wallet_observations(wallet_id,movement_id) where movement_id is not null;
create unique index wallet_observation_payout on public.nodal_wallet_observations(payout_id) where payout_id is not null;
alter table public.nodal_wallet_sources enable row level security;
alter table public.nodal_wallet_observations enable row level security;
create policy wallet_sources_read on public.nodal_wallet_sources for select to authenticated
  using(public.can_access_workspace(workspace_id));
create policy wallet_observations_read on public.nodal_wallet_observations for select to authenticated
  using(exists(select 1 from public.nodal_wallet_sources s where s.wallet_id = nodal_wallet_observations.wallet_id and public.can_access_workspace(s.workspace_id)));
revoke all on public.nodal_wallet_sources, public.nodal_wallet_observations from public, anon, authenticated;
grant select on public.nodal_wallet_sources, public.nodal_wallet_observations to authenticated;
grant all on public.nodal_wallet_sources, public.nodal_wallet_observations to service_role;

create function public.configure_nodal_wallet_source(target_wallet_id uuid, target_identity_id uuid, target_address text)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_workspace uuid; previous public.nodal_wallet_sources; cleaned text := nullif(lower(btrim(target_address)), '');
begin
  select w.workspace_id into selected_workspace from public.nodal_wallets w
    join public.workspaces s on s.id=w.workspace_id
    where w.id=target_wallet_id and w.is_active and s.owner_user_id=auth.uid() and public.can_access_workspace(w.workspace_id)
    for update of w;
  if not found then raise exception 'Wallet not available'; end if;
  select * into previous from public.nodal_wallet_sources where wallet_id=target_wallet_id;
  if previous.address is not null and previous.address is distinct from cleaned then
    raise exception 'Wallet address is immutable; register a different wallet';
  end if;
  insert into public.nodal_wallet_sources(wallet_id,workspace_id,identity_id,address)
    values(target_wallet_id,selected_workspace,target_identity_id,cleaned)
    on conflict(wallet_id) do update set identity_id=excluded.identity_id,address=excluded.address,
      started_at=case when nodal_wallet_sources.address is null and excluded.address is not null then now() else nodal_wallet_sources.started_at end;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,previous_data,current_data,reason)
    values(auth.uid(),'nodal_wallet_sources',target_wallet_id,'wallet_source_configured',to_jsonb(previous),
      jsonb_build_object('identity_id',target_identity_id,'address',cleaned),'Configuración de lectura, sin modificar saldos contables');
end; $$;
revoke all on function public.configure_nodal_wallet_source(uuid,uuid,text) from public,anon;
grant execute on function public.configure_nodal_wallet_source(uuid,uuid,text) to authenticated;

create function public.claim_nodal_wallet_sync(target_wallet_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare token uuid := gen_random_uuid();
begin
  update public.nodal_wallet_sources set lease_until=now()+interval '5 minutes',lease_token=token
    where wallet_id=target_wallet_id and address is not null
      and exists(select 1 from public.nodal_wallets w join public.workspaces s on s.id=w.workspace_id
        join public.nodal_users u on u.id=s.owner_user_id
        where w.id=target_wallet_id and w.is_active and u.access_state='active')
      and (lease_until is null or lease_until < now());
  if not found then return null; end if;
  return token;
end; $$;
revoke all on function public.claim_nodal_wallet_sync(uuid) from public,anon,authenticated;
grant execute on function public.claim_nodal_wallet_sync(uuid) to service_role;

create function public.complete_nodal_wallet_sync(target_wallet_id uuid,target_token uuid,target_through timestamptz,target_balance bigint,target_breakdown jsonb,target_transfers jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare source public.nodal_wallet_sources; item jsonb;
begin
  select * into source from public.nodal_wallet_sources where wallet_id=target_wallet_id for update;
  if not found or source.lease_token is distinct from target_token or source.lease_until < now() then raise exception 'Sync lease expired'; end if;
  if target_balance < 0 or target_through > now() or (source.synced_through is not null and target_through < source.synced_through) then raise exception 'Invalid sync'; end if;
  for item in select * from jsonb_array_elements(target_transfers) loop
    if (item->>'occurred_at')::timestamptz >= source.started_at then
      insert into public.nodal_wallet_observations(wallet_id,chain,tx_hash,log_index,token_address,symbol,raw_amount,amount_cents,direction,occurred_at,from_address,to_address)
      values(target_wallet_id,item->>'chain',item->>'tx_hash',(item->>'log_index')::integer,item->>'token_address',item->>'symbol',item->>'raw_amount',(item->>'amount_cents')::bigint,item->>'direction',(item->>'occurred_at')::timestamptz,item->>'from_address',item->>'to_address')
      on conflict(wallet_id,chain,tx_hash,log_index) do nothing;
    end if;
  end loop;
  update public.nodal_wallet_sources set observed_cents=target_balance,breakdown=target_breakdown,observed_at=now(),last_attempted_at=now(),
    synced_through=target_through,last_error=null,lease_until=now()+interval '10 minutes',lease_token=null where wallet_id=target_wallet_id;
end; $$;
revoke all on function public.complete_nodal_wallet_sync(uuid,uuid,timestamptz,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_nodal_wallet_sync(uuid,uuid,timestamptz,bigint,jsonb,jsonb) to service_role;

create function public.link_nodal_wallet_observation(target_observation_id uuid,target_movement_id uuid,target_payout_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare observation public.nodal_wallet_observations; selected_workspace uuid; selected_period uuid;
  expected_cents bigint; expected_date date; expected_direction text; lifecycle text;
begin
  if num_nonnulls(target_movement_id,target_payout_id) <> 1 then raise exception 'Choose one record'; end if;
  select o.* into observation from public.nodal_wallet_observations o
    join public.nodal_wallet_sources s on s.wallet_id=o.wallet_id
    join public.workspaces w on w.id=s.workspace_id
    where o.id=target_observation_id and w.owner_user_id=auth.uid() and public.can_access_workspace(w.id) for update of o;
  if not found then raise exception 'Observation unavailable'; end if;
  if observation.movement_id is not null or observation.payout_id is not null then
    if observation.movement_id is not distinct from target_movement_id and observation.payout_id is not distinct from target_payout_id then return; end if;
    raise exception 'Observation already linked';
  end if;
  select workspace_id into selected_workspace from public.nodal_wallet_sources where wallet_id=observation.wallet_id;
  if target_movement_id is not null then
    select m.period_id,m.occurred_on,
      case when m.destination_wallet_id=observation.wallet_id then 'in'
        when m.kind in ('external_contribution','prior_pending_collection','broker_to_wallet') then 'in' else 'out' end,
      case when m.destination_wallet_id=observation.wallet_id or m.kind='broker_to_wallet' then m.amount_cents-m.fee_cents else m.amount_cents end
    into selected_period,expected_date,expected_direction,expected_cents from public.wallet_movements m
    where m.id=target_movement_id and (m.wallet_id=observation.wallet_id or m.destination_wallet_id=observation.wallet_id) for update;
  else
    select p.period_id,p.collected_on,'in',p.amount_cents-p.collection_fee_cents
    into selected_period,expected_date,expected_direction,expected_cents from public.funding_withdrawals p
    where p.id=target_payout_id and p.wallet_id=observation.wallet_id and p.is_active and p.collected_on is not null for update;
  end if;
  if selected_period is null then raise exception 'Economic record unavailable'; end if;
  select lifecycle_status::text into lifecycle from public.periods where id=selected_period and workspace_id=selected_workspace for update;
  if lifecycle is null or lifecycle <> 'open' then raise exception 'Period is not open'; end if;
  if expected_direction <> observation.direction or expected_cents <> observation.amount_cents or expected_cents <= 0
    or expected_date <> (observation.occurred_at at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'Date, direction or amount does not match';
  end if;
  update public.nodal_wallet_observations set movement_id=target_movement_id,payout_id=target_payout_id,linked_by=auth.uid(),linked_at=now() where id=target_observation_id;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
    values(auth.uid(),'nodal_wallet_observations',target_observation_id,'wallet_observation_linked',
      jsonb_build_object('movement_id',target_movement_id,'payout_id',target_payout_id),'Vinculación explícita de evidencia; no genera asiento ni altera resultados');
end; $$;
revoke all on function public.link_nodal_wallet_observation(uuid,uuid,uuid) from public,anon;
grant execute on function public.link_nodal_wallet_observation(uuid,uuid,uuid) to authenticated;
