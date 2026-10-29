-- Revierte la preselección administrativa creada durante el despliegue de
-- APP-228. La regla general exige que el usuario vea cada número observado y
-- decida por sí mismo si lo confirma o lo descarta.

with target as (
  select users.id as owner_user_id
  from public.nodal_users users
  where lower(users.email)=lower('toralesjavierv@gmail.com')
), removed as (
  delete from public.ninja_broker_account_exclusions exclusions
  using target
  where exclusions.owner_user_id=target.owner_user_id
    and upper(btrim(exclusions.account_name))='2177299'
    and exclusions.reason='Partición broker de Gastón visible en el Ninja compartido'
  returning exclusions.id,exclusions.owner_user_id,exclusions.account_name,
    exclusions.reason,exclusions.excluded_at
)
insert into public.audit_events(
  actor_user_id,entity_table,entity_id,action,previous_data,current_data,reason
)
select removed.owner_user_id,'ninja_broker_account_exclusions',removed.id,
  'ninja_broker_preselection_removed',to_jsonb(removed),
  jsonb_build_object('account_name',removed.account_name,'excluded',false),
  'Se retiró la preselección administrativa; el titular debe confirmar o descartar cada partición observada'
from removed;
