-- APP-165: una baja de acceso invalida también la sesión técnica de Ninja.
-- Una reactivación posterior nunca puede reutilizar un conector anterior a la baja.

create or replace function public.revoke_ninja_access_with_nodal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.access_state = 'revoked'::public.nodal_access_state
    and old.access_state is distinct from 'revoked'::public.nodal_access_state then
    with revoked_connectors as (
      update public.ninja_connectors connectors
      set status = 'revoked', revoked_at = now()
      where connectors.owner_user_id = new.id
        and connectors.status = 'active'
      returning connectors.id
    )
    insert into public.audit_events(
      actor_user_id, entity_table, entity_id, action,
      previous_data, current_data, reason
    )
    select
      coalesce(auth.uid(), new.id), 'ninja_connectors', connector.id,
      'ninja_connector_revoked_with_user_access',
      jsonb_build_object('status', 'active'),
      jsonb_build_object('status', 'revoked'),
      'Revocación automática por baja del acceso NODAL'
    from revoked_connectors connector;

    update public.ninja_pairing_codes codes
    set expires_at = now()
    where codes.owner_user_id = new.id
      and codes.consumed_at is null
      and codes.expires_at > now();
  end if;

  return new;
end;
$$;

revoke all on function public.revoke_ninja_access_with_nodal_user()
from public, anon, authenticated;

drop trigger if exists nodal_users_revoke_ninja_access on public.nodal_users;
create trigger nodal_users_revoke_ninja_access
after update of access_state on public.nodal_users
for each row execute function public.revoke_ninja_access_with_nodal_user();

-- Reparación aditiva: si un conector activo es anterior a la última baja
-- registrada, no pertenece al ciclo de acceso vigente aunque el usuario haya
-- sido aprobado nuevamente.
with latest_revocations as (
  select events.target_user_id, max(events.occurred_at) as revoked_at
  from public.access_authorization_events events
  where events.action = 'revoked'::public.nodal_access_action
  group by events.target_user_id
), repaired as (
  update public.ninja_connectors connectors
  set status = 'revoked', revoked_at = now()
  from latest_revocations revocations
  where connectors.owner_user_id = revocations.target_user_id
    and connectors.status = 'active'
    and connectors.paired_at <= revocations.revoked_at
  returning connectors.id, connectors.owner_user_id
)
insert into public.audit_events(
  actor_user_id, entity_table, entity_id, action,
  previous_data, current_data, reason
)
select
  repaired.owner_user_id, 'ninja_connectors', repaired.id,
  'ninja_connector_revoked_after_access_history_repair',
  jsonb_build_object('status', 'active'),
  jsonb_build_object('status', 'revoked'),
  'Reparación APP-165: el conector era anterior a la última baja del usuario'
from repaired;

comment on function public.revoke_ninja_access_with_nodal_user() is
  'Revoca conectores activos y códigos pendientes cuando el acceso NODAL pasa a revocado.';
