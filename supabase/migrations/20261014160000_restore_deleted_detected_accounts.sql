-- Una eliminación corrige el registro económico, pero no debe bloquear para
-- siempre una cuenta que Ninja volvió a informar y el usuario decidió revisar.

create or replace function public.restore_current_user_ninja_account_registration_exclusions(
  target_connector_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_exclusion public.ninja_account_registration_exclusions%rowtype;
  restored_count integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication is required';
  end if;

  perform 1
  from public.ninja_connectors connectors
  where connectors.id = target_connector_id
    and connectors.owner_user_id = actor_id
    and connectors.status = 'active'
    and public.is_current_user_active()
  for update;
  if not found then
    raise exception 'ninja_connector_not_available';
  end if;

  for selected_exclusion in
    select exclusions.*
    from public.ninja_account_registration_exclusions exclusions
    where exclusions.owner_user_id = actor_id
      and exclusions.connector_id = target_connector_id
      and exists (
        select 1
        from public.ninja_inventory_snapshots snapshots,
          jsonb_array_elements(snapshots.accounts) account
        where snapshots.connector_id = exclusions.connector_id
          and snapshots.observed_at >= exclusions.created_at
          and btrim(account ->> 'connectionName') = btrim(exclusions.connection_name)
          and btrim(account ->> 'accountName') = btrim(exclusions.external_account_name)
      )
    for update
  loop
    insert into public.audit_events(
      actor_user_id,
      entity_table,
      entity_id,
      action,
      previous_data,
      reason
    ) values (
      actor_id,
      'ninja_account_registration_exclusions',
      selected_exclusion.id,
      'ninja_account_registration_exclusion_restored',
      to_jsonb(selected_exclusion),
      'El titular solicitó volver a detectar cuentas informadas por NinjaTrader'
    );

    delete from public.ninja_account_registration_exclusions
    where id = selected_exclusion.id;
    restored_count := restored_count + 1;
  end loop;

  return restored_count;
end;
$$;

revoke all on function public.restore_current_user_ninja_account_registration_exclusions(uuid)
from public, anon;
grant execute on function public.restore_current_user_ninja_account_registration_exclusions(uuid)
to authenticated;

comment on function public.restore_current_user_ninja_account_registration_exclusions(uuid) is
  'Rehabilita cuentas eliminadas que el mismo conector volvió a informar después de la corrección, con auditoría.';
