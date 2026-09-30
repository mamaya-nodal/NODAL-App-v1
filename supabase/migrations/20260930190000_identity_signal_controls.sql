-- APP-122: una instalación Ninja física puede alimentar destinos contables excluyentes.
alter table public.ninja_inventory_snapshots
  add column physical_connector_id uuid references public.ninja_connectors(id) on delete restrict;
update public.ninja_inventory_snapshots set physical_connector_id=connector_id
where physical_connector_id is null and connector_id is not null;
create index ninja_inventory_physical_observed_idx
  on public.ninja_inventory_snapshots(physical_connector_id,observed_at desc);

create table public.ninja_connector_destinations(
  physical_connector_id uuid not null references public.ninja_connectors(id) on delete restrict,
  destination_connector_id uuid not null references public.ninja_connectors(id) on delete restrict,
  destination_owner_user_id uuid not null references public.nodal_users(id) on delete restrict,
  identity_id uuid references public.nodal_identities(id) on delete restrict,
  route_kind text not null check(route_kind in('personal','identity')),
  is_enabled boolean not null default true,
  linked_at timestamptz not null default now(),
  linked_by uuid not null references auth.users(id) on delete restrict,
  primary key(physical_connector_id,destination_connector_id),
  constraint ninja_destination_identity_kind check(
    (route_kind='personal' and identity_id is null) or
    (route_kind='identity' and identity_id is not null))
);
create unique index ninja_connector_destinations_identity_idx
  on public.ninja_connector_destinations(physical_connector_id,identity_id) where identity_id is not null;
create index ninja_connector_destinations_owner_idx
  on public.ninja_connector_destinations(destination_owner_user_id,identity_id);

create table public.ninja_connector_route_epochs(
  id bigint generated always as identity primary key,
  physical_connector_id uuid not null references public.ninja_connectors(id) on delete restrict,
  destination_connector_id uuid references public.ninja_connectors(id) on delete restrict,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  changed_by uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  constraint ninja_route_epoch_dates check(effective_until is null or effective_until>=effective_from)
);
create unique index ninja_connector_one_open_epoch
  on public.ninja_connector_route_epochs(physical_connector_id) where effective_until is null;
create index ninja_connector_route_epoch_lookup_idx
  on public.ninja_connector_route_epochs(physical_connector_id,effective_from desc);

create table public.ninja_account_ownership(
  physical_connector_id uuid not null references public.ninja_connectors(id) on delete restrict,
  connection_name text not null,
  account_name text not null,
  account_type text not null check(account_type in('prop','broker')),
  destination_connector_id uuid not null references public.ninja_connectors(id) on delete restrict,
  owner_user_id uuid not null references public.nodal_users(id) on delete restrict,
  claimed_at timestamptz not null default now(),
  claimed_by uuid not null references auth.users(id) on delete restrict,
  primary key(physical_connector_id,connection_name,account_name),
  constraint ninja_account_ownership_names check(
    nullif(btrim(connection_name),'') is not null and nullif(btrim(account_name),'') is not null)
);
create index ninja_account_ownership_destination_idx
  on public.ninja_account_ownership(destination_connector_id,account_type);

create table public.ninja_unclaimed_broker_accounts(
  physical_connector_id uuid not null references public.ninja_connectors(id) on delete restrict,
  connection_name text not null,
  account_name text not null,
  proposed_destination_connector_id uuid references public.ninja_connectors(id) on delete restrict,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  latest_balance_cents bigint,
  primary key(physical_connector_id,connection_name,account_name)
);

create table public.ninja_identity_signal_controls(
  identity_id uuid primary key references public.nodal_identities(id) on delete cascade,
  owner_user_id uuid not null references public.nodal_users(id) on delete restrict,
  is_enabled boolean not null default true,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id) on delete restrict,
  constraint ninja_identity_signal_owner_matches check(owner_user_id=changed_by)
);

insert into public.ninja_connector_destinations(
  physical_connector_id,destination_connector_id,destination_owner_user_id,identity_id,route_kind,is_enabled,linked_at,linked_by)
select c.id,c.id,c.owner_user_id,c.identity_id,
  case when c.identity_id is null then 'personal' else 'identity' end,true,c.paired_at,c.owner_user_id
from public.ninja_connectors c where c.status='active' on conflict do nothing;
insert into public.ninja_connector_route_epochs(
  physical_connector_id,destination_connector_id,effective_from,changed_by,reason)
select c.id,c.id,c.paired_at,c.owner_user_id,'Ruta inicial migrada desde el vínculo existente'
from public.ninja_connectors c where c.status='active' on conflict do nothing;
insert into public.ninja_identity_signal_controls(identity_id,owner_user_id,is_enabled,changed_by)
select i.id,w.owner_user_id,true,w.owner_user_id
from public.nodal_identities i join public.workspaces w on w.id=i.workspace_id
where i.onboarding_status='approved' on conflict do nothing;

create function public.initialize_ninja_connector_route()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.connector_version='shared-destination' then return new; end if;
  insert into public.ninja_connector_destinations(physical_connector_id,destination_connector_id,
    destination_owner_user_id,identity_id,route_kind,is_enabled,linked_at,linked_by)
  values(new.id,new.id,new.owner_user_id,new.identity_id,
    case when new.identity_id is null then 'personal' else 'identity' end,true,new.paired_at,new.owner_user_id)
  on conflict do nothing;
  insert into public.ninja_connector_route_epochs(physical_connector_id,destination_connector_id,
    effective_from,changed_by,reason)
  values(new.id,new.id,new.paired_at,new.owner_user_id,'Ruta inicial creada con la vinculación')
  on conflict do nothing;
  if new.identity_id is not null then
    insert into public.ninja_identity_signal_controls(identity_id,owner_user_id,is_enabled,changed_by)
    values(new.identity_id,new.owner_user_id,true,new.owner_user_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger ninja_connectors_initialize_route after insert on public.ninja_connectors
for each row execute function public.initialize_ninja_connector_route();

alter table public.ninja_connector_destinations enable row level security;
alter table public.ninja_connector_route_epochs enable row level security;
alter table public.ninja_account_ownership enable row level security;
alter table public.ninja_unclaimed_broker_accounts enable row level security;
alter table public.ninja_identity_signal_controls enable row level security;
revoke all on public.ninja_connector_destinations,public.ninja_connector_route_epochs,
  public.ninja_account_ownership,public.ninja_unclaimed_broker_accounts,
  public.ninja_identity_signal_controls from public,anon,authenticated;
create policy ninja_destinations_read_own on public.ninja_connector_destinations for select to authenticated
  using(destination_owner_user_id=(select auth.uid()) and public.is_current_user_active());
create policy ninja_epochs_read_own on public.ninja_connector_route_epochs for select to authenticated using(exists(
  select 1 from public.ninja_connector_destinations d
  where d.physical_connector_id=ninja_connector_route_epochs.physical_connector_id
    and d.destination_owner_user_id=(select auth.uid())));
create policy ninja_ownership_read_own on public.ninja_account_ownership for select to authenticated
  using(owner_user_id=(select auth.uid()) and public.is_current_user_active());
create policy ninja_unclaimed_broker_read_proposed on public.ninja_unclaimed_broker_accounts for select to authenticated using(exists(
  select 1 from public.ninja_connectors c where c.id=ninja_unclaimed_broker_accounts.proposed_destination_connector_id
    and c.owner_user_id=(select auth.uid()) and c.status='active'));
create policy ninja_signal_read_own on public.ninja_identity_signal_controls for select to authenticated
  using(owner_user_id=(select auth.uid()) and public.is_current_user_active());
grant select on public.ninja_connector_destinations,public.ninja_connector_route_epochs,
  public.ninja_account_ownership,public.ninja_unclaimed_broker_accounts,
  public.ninja_identity_signal_controls to authenticated;

create function public.resolve_ninja_connector_destination(target_physical_connector_id uuid,target_occurred_at timestamptz)
returns table(destination_connector_id uuid,destination_owner_user_id uuid)
language sql security definer set search_path='' stable as $$
  select e.destination_connector_id,c.owner_user_id
  from public.ninja_connector_route_epochs e left join public.ninja_connectors c on c.id=e.destination_connector_id
  where e.physical_connector_id=target_physical_connector_id and e.effective_from<=target_occurred_at
    and(e.effective_until is null or e.effective_until>target_occurred_at)
  order by e.effective_from desc limit 1
$$;

create function public.link_ninja_connector_destination(target_physical_connector_id uuid,target_code_hash text)
returns table(destination_connector_id uuid,destination_owner_user_id uuid,route_kind text)
language plpgsql security definer set search_path='' as $$
declare code public.ninja_pairing_codes%rowtype; source public.ninja_connectors%rowtype;
  destination_id uuid; kind text; enable_new boolean;
begin
  select * into source from public.ninja_connectors c where c.id=target_physical_connector_id and c.status='active' for update;
  if not found then raise exception 'Connector is not active'; end if;
  select * into code from public.ninja_pairing_codes p
  where p.code_hash=target_code_hash and p.consumed_at is null and p.expires_at>now() for update;
  if not found then raise exception 'Pairing code is invalid or expired'; end if;
  if not exists(select 1 from public.nodal_users u where u.id=code.owner_user_id and u.access_state='active') then
    raise exception 'NODAL user is not active'; end if;
  kind:=case when code.identity_id is null then 'personal' else 'identity' end;
  select c.id into destination_id from public.ninja_connectors c
  where c.owner_user_id=code.owner_user_id and c.identity_id is not distinct from code.identity_id
  order by(c.status='active') desc,c.paired_at desc limit 1 for update;
  if destination_id is null then
    insert into public.ninja_connectors(owner_user_id,identity_id,status,connector_version,
      access_token_hash,access_expires_at,refresh_token_hash,refresh_expires_at)
    values(code.owner_user_id,code.identity_id,'active','shared-destination',
      encode(extensions.digest(extensions.gen_random_uuid()::text,'sha256'),'hex'),now(),
      encode(extensions.digest(extensions.gen_random_uuid()::text,'sha256'),'hex'),now()) returning id into destination_id;
  else update public.ninja_connectors set status='active',revoked_at=null where id=destination_id; end if;
  if exists(select 1 from public.ninja_connector_destinations d
    where d.physical_connector_id=target_physical_connector_id and d.destination_connector_id=destination_id) then
    raise exception 'Destination is already linked'; end if;
  enable_new:=kind='personal' and not exists(select 1 from public.ninja_connector_destinations d
    where d.physical_connector_id=target_physical_connector_id and d.route_kind='identity' and d.is_enabled);
  insert into public.ninja_connector_destinations values(target_physical_connector_id,destination_id,
    code.owner_user_id,code.identity_id,kind,case when kind='identity' then false else true end,now(),code.owner_user_id);
  if code.identity_id is not null then
    insert into public.ninja_identity_signal_controls(identity_id,owner_user_id,is_enabled,changed_by)
    values(code.identity_id,code.owner_user_id,false,code.owner_user_id)
    on conflict(identity_id) do update set is_enabled=false,changed_at=now(),changed_by=code.owner_user_id;
  end if;
  update public.ninja_pairing_codes set consumed_at=now(),consumed_by_connector_id=destination_id where id=code.id;
  if enable_new then
    update public.ninja_connector_route_epochs set effective_until=now()
    where physical_connector_id=target_physical_connector_id and effective_until is null;
    insert into public.ninja_connector_route_epochs(physical_connector_id,destination_connector_id,changed_by,reason)
    values(target_physical_connector_id,destination_id,code.owner_user_id,'App personal agregada como destino de respaldo');
  end if;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(code.owner_user_id,'ninja_connector_destinations',destination_id,'ninja_destination_linked',
    jsonb_build_object('physical_connector_id',target_physical_connector_id,'route_kind',kind,'identity_id',code.identity_id),
    'Destino adicional autorizado con código temporal sin reemplazar el vínculo existente');
  return query select destination_id,code.owner_user_id,kind;
end;
$$;

create function public.set_ninja_identity_signal(target_identity_id uuid,target_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); destination_id uuid; physical_id uuid; fallback_id uuid; previous_enabled boolean;
begin
  if actor is null or target_enabled is null or not public.is_current_user_active() then raise exception 'Not authorized'; end if;
  select d.destination_connector_id,d.physical_connector_id,d.is_enabled into destination_id,physical_id,previous_enabled
  from public.ninja_connector_destinations d where d.identity_id=target_identity_id and d.destination_owner_user_id=actor for update;
  if not found then raise exception 'Identity connector is not available'; end if;
  if previous_enabled=target_enabled then return target_enabled; end if;
  if exists(select 1 from public.ninja_operation_probe_sessions s
    where s.connector_id=destination_id and s.status in('open','settling') and s.excluded_at is null) then
    raise exception 'Identity has an operation in progress'; end if;
  update public.ninja_connector_destinations set is_enabled=false
  where physical_connector_id=physical_id and route_kind='identity';
  if target_enabled then update public.ninja_connector_destinations set is_enabled=true
    where physical_connector_id=physical_id and destination_connector_id=destination_id; end if;
  select d.destination_connector_id into fallback_id from public.ninja_connector_destinations d
  where d.physical_connector_id=physical_id and d.route_kind='personal' and d.is_enabled order by d.linked_at desc limit 1;
  update public.ninja_connector_route_epochs set effective_until=now()
  where physical_connector_id=physical_id and effective_until is null;
  insert into public.ninja_connector_route_epochs(physical_connector_id,destination_connector_id,changed_by,reason)
  values(physical_id,case when target_enabled then destination_id else fallback_id end,actor,
    case when target_enabled then 'Identidad activada por el titular' else 'Identidad pausada por el titular' end);
  insert into public.ninja_identity_signal_controls(identity_id,owner_user_id,is_enabled,changed_by)
  values(target_identity_id,actor,target_enabled,actor) on conflict(identity_id) do update set
    is_enabled=excluded.is_enabled,changed_at=now(),changed_by=actor;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,previous_data,current_data,reason)
  values(actor,'ninja_identity_signal_controls',target_identity_id,'ninja_identity_signal_changed',
    jsonb_build_object('is_enabled',previous_enabled),jsonb_build_object('is_enabled',target_enabled),
    'Cambio solicitado desde Identidades; la ruta histórica queda fechada');
  return target_enabled;
end;
$$;

create function public.claim_ninja_broker_account(target_physical_connector_id uuid,target_connection_name text,target_account_name text)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); destination_id uuid;
begin
  if actor is null or not public.is_current_user_active() then raise exception 'Not authorized'; end if;
  select u.proposed_destination_connector_id into destination_id
  from public.ninja_unclaimed_broker_accounts u join public.ninja_connectors c on c.id=u.proposed_destination_connector_id
  where u.physical_connector_id=target_physical_connector_id and u.connection_name=btrim(target_connection_name)
    and u.account_name=btrim(target_account_name) and c.owner_user_id=actor and c.status='active' for update of u;
  if not found then raise exception 'Broker account is not available'; end if;
  insert into public.ninja_account_ownership(physical_connector_id,connection_name,account_name,account_type,
    destination_connector_id,owner_user_id,claimed_by)
  values(target_physical_connector_id,btrim(target_connection_name),btrim(target_account_name),'broker',destination_id,actor,actor)
  on conflict(physical_connector_id,connection_name,account_name) do update set
    destination_connector_id=excluded.destination_connector_id,owner_user_id=excluded.owner_user_id,claimed_at=now(),claimed_by=actor
  where public.ninja_account_ownership.owner_user_id=actor;
  delete from public.ninja_unclaimed_broker_accounts where physical_connector_id=target_physical_connector_id
    and connection_name=btrim(target_connection_name) and account_name=btrim(target_account_name);
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(actor,'ninja_account_ownership',destination_id,'ninja_broker_account_claimed',
    jsonb_build_object('physical_connector_id',target_physical_connector_id,'connection_name',btrim(target_connection_name),'account_name',btrim(target_account_name)),
    'Titularidad de subcuenta broker confirmada por el usuario');
  return true;
end;
$$;

create function public.enforce_ninja_prop_ownership()
returns trigger language plpgsql security definer set search_path='' as $$
declare physical_id uuid; owner_id uuid;
begin
  select coalesce(s.physical_connector_id,s.connector_id) into physical_id
  from public.ninja_inventory_snapshots s,jsonb_array_elements(s.accounts) a
  where s.connector_id=new.connector_id and a->>'connectionName'=new.connection_name
    and a->>'accountName'=new.external_account_name order by s.observed_at desc limit 1;
  if physical_id is null then physical_id:=new.connector_id; end if;
  select c.owner_user_id into owner_id from public.ninja_connectors c where c.id=new.connector_id;
  if exists(select 1 from public.ninja_account_ownership o where o.physical_connector_id=physical_id
    and o.connection_name=new.connection_name and o.account_name=new.external_account_name and o.owner_user_id<>owner_id) then
    raise exception 'Ninja account belongs to another ledger'; end if;
  insert into public.ninja_account_ownership(physical_connector_id,connection_name,account_name,account_type,
    destination_connector_id,owner_user_id,claimed_by,claimed_at)
  values(physical_id,new.connection_name,new.external_account_name,'prop',new.connector_id,owner_id,new.linked_by,new.first_seen_at)
  on conflict(physical_connector_id,connection_name,account_name) do nothing;
  return new;
end;
$$;
create trigger ninja_account_links_lock_ledger before insert on public.ninja_account_links
for each row execute function public.enforce_ninja_prop_ownership();

insert into public.ninja_account_ownership(physical_connector_id,connection_name,account_name,account_type,
  destination_connector_id,owner_user_id,claimed_by,claimed_at)
select coalesce(s.physical_connector_id,l.connector_id),l.connection_name,l.external_account_name,'prop',
  l.connector_id,c.owner_user_id,l.linked_by,l.first_seen_at
from public.ninja_account_links l join public.ninja_connectors c on c.id=l.connector_id
left join lateral(select sn.physical_connector_id from public.ninja_inventory_snapshots sn,jsonb_array_elements(sn.accounts) a
  where sn.connector_id=l.connector_id and a->>'connectionName'=l.connection_name and a->>'accountName'=l.external_account_name
  order by sn.observed_at desc limit 1) s on true
where l.connector_id is not null on conflict do nothing;

-- Numeric accounts are the confirmed broker convention in the current connector.
-- Preserve their existing ledger so the migration does not interrupt known balances.
insert into public.ninja_account_ownership(physical_connector_id,connection_name,account_name,account_type,
  destination_connector_id,owner_user_id,claimed_by,claimed_at)
select distinct e.connector_id,e.connection_name,e.account_name,'broker',e.connector_id,c.owner_user_id,c.owner_user_id,
  min(e.occurred_at) over(partition by e.connector_id,e.connection_name,e.account_name)
from public.ninja_trade_telemetry_events e join public.ninja_connectors c on c.id=e.connector_id
where e.account_name~'^[0-9]+$' on conflict do nothing;

revoke all on function public.resolve_ninja_connector_destination(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.link_ninja_connector_destination(uuid,text) from public,anon,authenticated;
revoke all on function public.set_ninja_identity_signal(uuid,boolean) from public,anon;
revoke all on function public.claim_ninja_broker_account(uuid,text,text) from public,anon;
grant execute on function public.resolve_ninja_connector_destination(uuid,timestamptz) to service_role;
grant execute on function public.link_ninja_connector_destination(uuid,text) to service_role;
grant execute on function public.set_ninja_identity_signal(uuid,boolean) to authenticated;
grant execute on function public.claim_ninja_broker_account(uuid,text,text) to authenticated;
