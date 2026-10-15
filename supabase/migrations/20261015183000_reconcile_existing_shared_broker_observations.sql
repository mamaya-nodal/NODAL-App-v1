-- Consolida observaciones pendientes cuyo número broker ya fue confirmado por
-- el mismo titular. Los números nunca confirmados permanecen pendientes.

with canonical_personal as (
  select distinct on (connectors.owner_user_id)
    connectors.owner_user_id,
    connectors.id as connector_id
  from public.ninja_connectors connectors
  where connectors.identity_id is null and connectors.status='active'
  order by connectors.owner_user_id,connectors.paired_at desc
), recognized_pending as (
  select pending.physical_connector_id,pending.connection_name,pending.account_name,
    personal.owner_user_id,personal.connector_id
  from public.ninja_unclaimed_broker_accounts pending
  join public.ninja_connectors proposed on proposed.id=pending.proposed_destination_connector_id
  join canonical_personal personal on personal.owner_user_id=proposed.owner_user_id
  where exists(
    select 1
    from public.ninja_account_ownership ownership
    where ownership.owner_user_id=personal.owner_user_id
      and ownership.account_type='broker'
      and btrim(ownership.account_name)=btrim(pending.account_name)
  )
), inserted as (
  insert into public.ninja_account_ownership(
    physical_connector_id,connection_name,account_name,account_type,
    destination_connector_id,owner_user_id,claimed_by,claimed_at
  )
  select physical_connector_id,connection_name,account_name,'broker',connector_id,
    owner_user_id,owner_user_id,now()
  from recognized_pending
  on conflict(physical_connector_id,connection_name,account_name) do update set
    destination_connector_id=excluded.destination_connector_id,
    owner_user_id=excluded.owner_user_id,
    account_type='broker',
    claimed_at=now(),
    claimed_by=excluded.claimed_by
  where public.ninja_account_ownership.owner_user_id=excluded.owner_user_id
  returning owner_user_id,destination_connector_id,physical_connector_id,
    connection_name,account_name
)
insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
select inserted.owner_user_id,'ninja_account_ownership',inserted.destination_connector_id,
  'ninja_shared_broker_account_recognized',
  jsonb_build_object('physical_connector_id',inserted.physical_connector_id,
    'connection_name',inserted.connection_name,'account_name',inserted.account_name),
  'Número broker previamente confirmado y observado desde otra conexión NinjaTrader del titular'
from inserted;

delete from public.ninja_unclaimed_broker_accounts pending
using public.ninja_account_ownership ownership,
  public.ninja_connectors proposed
where proposed.id=pending.proposed_destination_connector_id
  and ownership.physical_connector_id=pending.physical_connector_id
  and ownership.connection_name=pending.connection_name
  and ownership.account_name=pending.account_name
  and ownership.account_type='broker'
  and ownership.owner_user_id=proposed.owner_user_id;
