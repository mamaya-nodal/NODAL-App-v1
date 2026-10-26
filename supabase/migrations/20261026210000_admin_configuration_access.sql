-- APP-204: Configuracion es una capacidad administrada por Admin Master.
-- Oculta la seccion y gobierna los derechos de complementos del usuario.

alter table public.nodal_users
add column configuration_enabled boolean not null default false;

-- Conserva los accesos MIMICAL ya concedidos antes de introducir el control
-- general. Las altas futuras quedan deshabilitadas por omision.
update public.nodal_users users
set configuration_enabled = true,
    updated_at = now()
where exists (
  select 1
  from public.addon_entitlements entitlements
  where entitlements.owner_user_id = users.id
    and entitlements.product_key = 'mimical'
    and entitlements.identity_id is null
    and entitlements.status = 'active'
);

create or replace function public.admin_update_nodal_user_access(
  target_user_id uuid,
  target_role text,
  target_admin_bps integer,
  target_identities_enabled boolean,
  target_configuration_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_month date := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date;
  previous_configuration_enabled boolean;
  previous_identities_enabled boolean;
  target_desk_id uuid;
begin
  if target_identities_enabled is null then
    raise exception 'INVALID_IDENTITIES_ACCESS';
  end if;
  if target_configuration_enabled is null then
    raise exception 'INVALID_CONFIGURATION_ACCESS';
  end if;

  select users.identities_enabled, users.configuration_enabled
  into previous_identities_enabled, previous_configuration_enabled
  from public.nodal_users users
  where users.id = target_user_id
  for update;

  if previous_identities_enabled is null or previous_configuration_enabled is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  -- Conserva todas las validaciones de rol y jerarquia en la misma transaccion.
  perform public.admin_update_nodal_user_role(
    target_user_id,
    target_role,
    target_admin_bps
  );

  if previous_identities_enabled is distinct from target_identities_enabled
    or previous_configuration_enabled is distinct from target_configuration_enabled
  then
    update public.nodal_users
    set identities_enabled = target_identities_enabled,
        configuration_enabled = target_configuration_enabled,
        updated_at = now()
    where id = target_user_id;

    if target_configuration_enabled then
      insert into public.addon_entitlements(product_key, owner_user_id, identity_id, status, revoked_at)
      values ('mimical', target_user_id, null, 'active', null)
      on conflict (product_key, owner_user_id, (coalesce(identity_id, '00000000-0000-0000-0000-000000000000'::uuid)))
      do update set
        status = 'active',
        revoked_at = null,
        granted_at = case
          when public.addon_entitlements.status = 'revoked' then now()
          else public.addon_entitlements.granted_at
        end;
    else
      update public.addon_pairing_codes codes
      set expires_at = least(codes.expires_at, now())
      where codes.consumed_at is null
        and codes.entitlement_id in (
          select entitlements.id
          from public.addon_entitlements entitlements
          where entitlements.owner_user_id = target_user_id
        );

      update public.addon_installations installations
      set status = 'revoked',
          revoked_at = now()
      where installations.status = 'active'
        and installations.entitlement_id in (
          select entitlements.id
          from public.addon_entitlements entitlements
          where entitlements.owner_user_id = target_user_id
        );

      update public.addon_entitlements entitlements
      set status = 'revoked',
          revoked_at = now()
      where entitlements.owner_user_id = target_user_id
        and entitlements.status = 'active';
    end if;

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
      'user_capabilities_updated',
      jsonb_build_object(
        'identities_enabled', previous_identities_enabled,
        'configuration_enabled', previous_configuration_enabled
      ),
      jsonb_build_object(
        'identities_enabled', target_identities_enabled,
        'configuration_enabled', target_configuration_enabled
      )
    );
  end if;
end;
$$;

-- Compatibilidad temporal para una version anterior de la interfaz: conserva
-- Configuracion tal como estaba cuando solo se enviaba el permiso Identidades.
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
begin
  perform public.admin_update_nodal_user_access(
    target_user_id,
    target_role,
    target_admin_bps,
    target_identities_enabled,
    coalesce((
      select users.configuration_enabled
      from public.nodal_users users
      where users.id = target_user_id
    ), false)
  );
end;
$$;

revoke all on function public.admin_update_nodal_user_access(uuid, text, integer, boolean, boolean)
from public, anon;
grant execute on function public.admin_update_nodal_user_access(uuid, text, integer, boolean, boolean)
to authenticated;

revoke all on function public.admin_update_nodal_user_access(uuid, text, integer, boolean)
from public, anon;
grant execute on function public.admin_update_nodal_user_access(uuid, text, integer, boolean)
to authenticated;

comment on column public.nodal_users.configuration_enabled is
  'Acceso explicito a Configuracion y a sus complementos. Las altas nuevas comienzan deshabilitadas.';

comment on function public.admin_update_nodal_user_access(uuid, text, integer, boolean, boolean) is
  'Actualiza rol, mesa, Identidades y Configuracion en una transaccion auditada de Admin Master.';

comment on function public.admin_update_nodal_user_access(uuid, text, integer, boolean) is
  'Compatibilidad con clientes anteriores: actualiza rol e Identidades sin cambiar Configuracion.';
