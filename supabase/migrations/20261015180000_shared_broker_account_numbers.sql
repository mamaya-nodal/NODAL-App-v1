-- Una cuenta broker pertenece al usuario NODAL. El NinjaTrader que la observa
-- (personal o de una identidad) es sólo una fuente física de lectura.

create index if not exists ninja_account_ownership_owner_broker_number_idx
  on public.ninja_account_ownership(owner_user_id,account_type,account_name);

-- Corrige confirmaciones anteriores que conservaron como destino el conector de
-- una identidad. No cambia el número ni el titular económico de la cuenta.
with canonical_personal as (
  select distinct on (connectors.owner_user_id)
    connectors.owner_user_id,
    connectors.id as connector_id
  from public.ninja_connectors connectors
  where connectors.identity_id is null and connectors.status='active'
  order by connectors.owner_user_id,connectors.paired_at desc
), moved as (
  update public.ninja_account_ownership ownership
  set destination_connector_id=personal.connector_id
  from canonical_personal personal
  where ownership.owner_user_id=personal.owner_user_id
    and ownership.account_type='broker'
    and ownership.destination_connector_id<>personal.connector_id
  returning ownership.owner_user_id,ownership.destination_connector_id,
    ownership.physical_connector_id,ownership.connection_name,ownership.account_name
)
insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
select moved.owner_user_id,'ninja_account_ownership',moved.destination_connector_id,
  'ninja_broker_destination_repaired',
  jsonb_build_object('physical_connector_id',moved.physical_connector_id,
    'connection_name',moved.connection_name,'account_name',moved.account_name),
  'La cuenta broker es general del usuario aunque haya sido observada por el NinjaTrader de una identidad'
from moved;

-- Las cuentas todavía no confirmadas también se presentan en el espacio general
-- del usuario, nunca dentro de la identidad que las observó.
with proposed_owner as (
  select pending.physical_connector_id,pending.connection_name,pending.account_name,
    proposed.owner_user_id
  from public.ninja_unclaimed_broker_accounts pending
  join public.ninja_connectors proposed on proposed.id=pending.proposed_destination_connector_id
), canonical_personal as (
  select distinct on (connectors.owner_user_id)
    connectors.owner_user_id,
    connectors.id as connector_id
  from public.ninja_connectors connectors
  where connectors.identity_id is null and connectors.status='active'
  order by connectors.owner_user_id,connectors.paired_at desc
)
update public.ninja_unclaimed_broker_accounts pending
set proposed_destination_connector_id=personal.connector_id
from proposed_owner owner_map
join canonical_personal personal on personal.owner_user_id=owner_map.owner_user_id
where pending.physical_connector_id=owner_map.physical_connector_id
  and pending.connection_name=owner_map.connection_name
  and pending.account_name=owner_map.account_name;

create or replace function public.claim_ninja_broker_account(
  target_physical_connector_id uuid,
  target_connection_name text,
  target_account_name text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=(select auth.uid());
  personal_id uuid;
begin
  if actor is null or not public.is_current_user_active() then
    raise exception 'Not authorized';
  end if;

  select connectors.id into personal_id
  from public.ninja_connectors connectors
  where connectors.owner_user_id=actor
    and connectors.identity_id is null
    and connectors.status='active'
  order by connectors.paired_at desc
  limit 1
  for update;
  if personal_id is null then raise exception 'Personal connector is not available'; end if;

  if not exists(
    select 1
    from public.ninja_unclaimed_broker_accounts pending
    join public.ninja_connectors proposed on proposed.id=pending.proposed_destination_connector_id
    where pending.physical_connector_id=target_physical_connector_id
      and pending.connection_name=btrim(target_connection_name)
      and pending.account_name=btrim(target_account_name)
      and proposed.owner_user_id=actor
  ) then
    raise exception 'Broker account is not available';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::text || pg_catalog.chr(31) || btrim(target_account_name),0)
  );

  -- Toda observación ya confirmada de ese mismo número converge al conector
  -- personal, aun cuando provenga de otro NinjaTrader o nombre de conexión.
  update public.ninja_account_ownership ownership
  set destination_connector_id=personal_id,claimed_at=now(),claimed_by=actor
  where ownership.owner_user_id=actor
    and ownership.account_type='broker'
    and btrim(ownership.account_name)=btrim(target_account_name);

  insert into public.ninja_account_ownership(
    physical_connector_id,connection_name,account_name,account_type,
    destination_connector_id,owner_user_id,claimed_by,claimed_at
  )
  select pending.physical_connector_id,pending.connection_name,pending.account_name,
    'broker',personal_id,actor,actor,now()
  from public.ninja_unclaimed_broker_accounts pending
  join public.ninja_connectors proposed on proposed.id=pending.proposed_destination_connector_id
  where proposed.owner_user_id=actor
    and btrim(pending.account_name)=btrim(target_account_name)
  on conflict(physical_connector_id,connection_name,account_name) do update set
    destination_connector_id=excluded.destination_connector_id,
    owner_user_id=excluded.owner_user_id,
    account_type='broker',
    claimed_at=now(),
    claimed_by=actor
  where public.ninja_account_ownership.owner_user_id=actor;

  delete from public.ninja_unclaimed_broker_accounts pending
  using public.ninja_connectors proposed
  where proposed.id=pending.proposed_destination_connector_id
    and proposed.owner_user_id=actor
    and btrim(pending.account_name)=btrim(target_account_name);

  insert into public.audit_events(
    actor_user_id,entity_table,entity_id,action,current_data,reason
  ) values (
    actor,'ninja_account_ownership',personal_id,'ninja_broker_account_claimed',
    jsonb_build_object('physical_connector_id',target_physical_connector_id,
      'connection_name',btrim(target_connection_name),
      'account_name',btrim(target_account_name),
      'scope','user'),
    'Cuenta broker confirmada para el usuario y compartida entre sus conectores NinjaTrader'
  );
  return true;
end;
$$;

revoke all on function public.claim_ninja_broker_account(uuid,text,text)
  from public,anon;
grant execute on function public.claim_ninja_broker_account(uuid,text,text)
  to authenticated;

comment on function public.claim_ninja_broker_account(uuid,text,text) is
  'Confirma por número una cuenta broker del usuario; todas sus observaciones físicas convergen al conector personal.';
