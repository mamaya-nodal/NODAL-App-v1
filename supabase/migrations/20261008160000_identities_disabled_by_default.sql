-- APP-172: Identidades es una capacidad habilitada explícitamente por Admin
-- o Admin Master. Las altas nuevas nunca la reciben por omisión.

alter table public.nodal_users
alter column identities_enabled set default false;

create or replace function public.admin_update_nodal_user_access(
  target_user_id uuid,
  target_role text,
  target_admin_bps integer,
  target_identities_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_month date := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date;
  previous_enabled boolean;
  target_desk_id uuid;
begin
  if target_identities_enabled is null then
    raise exception 'INVALID_IDENTITIES_ACCESS';
  end if;

  select users.identities_enabled into previous_enabled
  from public.nodal_users users
  where users.id = target_user_id
  for update;

  if previous_enabled is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  -- La función existente conserva las validaciones de jerarquía, dependencia,
  -- último Admin Master, nivel y auditoría. Al compartir transacción, cualquier
  -- falla revierte también el cambio de Identidades.
  perform public.admin_update_nodal_user_role(
    target_user_id,
    target_role,
    target_admin_bps
  );

  if previous_enabled is distinct from target_identities_enabled then
    update public.nodal_users
    set identities_enabled = target_identities_enabled,
        updated_at = now()
    where id = target_user_id;

    select terms.desk_id into target_desk_id
    from public.nodal_user_terms terms
    where terms.user_id = target_user_id
      and terms.effective_month <= current_month
    order by terms.effective_month desc
    limit 1;

    insert into public.nodal_management_history(
      user_id, desk_id, actor_id, effective_month, action, before_data, after_data
    ) values (
      target_user_id,
      target_desk_id,
      actor_id,
      current_month,
      'identities_access_updated',
      jsonb_build_object('identities_enabled', previous_enabled),
      jsonb_build_object('identities_enabled', target_identities_enabled)
    );
  end if;
end;
$$;

revoke all on function public.admin_update_nodal_user_access(uuid, text, integer, boolean)
from public, anon;
grant execute on function public.admin_update_nodal_user_access(uuid, text, integer, boolean)
to authenticated;

comment on column public.nodal_users.identities_enabled is
  'Acceso explícito a Identidades. Las altas nuevas comienzan deshabilitadas y sólo Admin o Admin Master pueden habilitarlo.';

comment on function public.admin_update_nodal_user_access(uuid, text, integer, boolean) is
  'Actualiza rol, mesa e Identidades en una sola transacción auditada de Admin Master.';
