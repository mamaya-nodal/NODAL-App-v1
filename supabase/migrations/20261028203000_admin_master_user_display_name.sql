-- Admin Master puede corregir el nombre visible sin alterar el correo de acceso.
-- La operación queda auditada y no se expone a los administradores de mesa.

create or replace function public.admin_update_nodal_user_display_name(
  target_user_id uuid,
  target_display_name text,
  management_reason text default 'Corrección de nombre desde Admin Master'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  previous_user public.nodal_users%rowtype;
  normalized_name text := nullif(btrim(target_display_name), '');
begin
  if actor_id is null or not public.is_current_user_admin() then
    raise exception 'ADMIN_MASTER_REQUIRED';
  end if;
  if normalized_name is null or char_length(normalized_name) > 120 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;

  select * into previous_user
  from public.nodal_users
  where id = target_user_id
  for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  if previous_user.display_name is not distinct from normalized_name then return; end if;

  update public.nodal_users
  set display_name = normalized_name,
      updated_at = now()
  where id = target_user_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action,
    previous_data, current_data, reason
  ) values (
    actor_id, 'nodal_users', target_user_id, 'admin_master_display_name_updated',
    jsonb_build_object('display_name', previous_user.display_name),
    jsonb_build_object('display_name', normalized_name),
    coalesce(nullif(btrim(management_reason), ''), 'Corrección de nombre desde Admin Master')
  );
end;
$$;

revoke all on function public.admin_update_nodal_user_display_name(uuid, text, text)
  from public, anon;
grant execute on function public.admin_update_nodal_user_display_name(uuid, text, text)
  to authenticated;

comment on function public.admin_update_nodal_user_display_name(uuid, text, text) is
  'Permite exclusivamente a Admin Master corregir el nombre visible con auditoría.';
