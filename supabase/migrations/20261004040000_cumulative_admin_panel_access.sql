-- El panel Admin (mesa) y Admin Master son capacidades independientes.
-- Esta tabla habilita una vista de comprobacion del panel Admin sin crear una
-- mesa ficticia ni conceder acceso a datos de terceros.
create table if not exists public.nodal_admin_panel_previews (
  user_id uuid primary key references public.nodal_users(id) on delete cascade,
  enabled boolean not null default true,
  granted_at timestamptz not null default now(),
  reason text not null,
  constraint nodal_admin_panel_preview_reason_present check (btrim(reason) <> '')
);

alter table public.nodal_admin_panel_previews enable row level security;
revoke all on table public.nodal_admin_panel_previews from public, anon, authenticated;

insert into public.nodal_admin_panel_previews(user_id, enabled, reason)
select users.id, true, 'Vista excepcional solicitada para comprobacion del panel Admin'
from public.nodal_users as users
where users.email = 'mauriciosebastianamaya@gmail.com'
on conflict (user_id) do update
set enabled = excluded.enabled,
    granted_at = now(),
    reason = excluded.reason;

create or replace function public.get_my_administration_scope()
returns table (
  scope text,
  desk_id uuid,
  desk_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with active_user as (
    select users.id, users.access_role
    from public.nodal_users as users
    where users.id = (select auth.uid())
      and users.access_state = 'active'
  ),
  current_desk_terms as (
    select distinct on (terms.desk_id)
      terms.desk_id,
      terms.manager_id,
      terms.active
    from public.nodal_desk_terms as terms
    where terms.effective_month <= public.nodal_accounting_period_month(now())
    order by terms.desk_id, terms.effective_month desc
  ),
  managed_desk as (
    select desks.id, desks.name
    from current_desk_terms as terms
    join public.nodal_desks as desks on desks.id = terms.desk_id
    join active_user as users on users.id = terms.manager_id
    where terms.active
      and desks.parent_id is not null
    order by desks.created_at, desks.id
    limit 1
  ),
  access as (
    select
      public.is_current_user_admin() as is_master,
      exists (
        select 1 from active_user where access_role = 'admin'
      ) as has_master_role,
      exists (
        select 1
        from public.nodal_admin_panel_previews as previews
        join active_user as users on users.id = previews.user_id
        where previews.enabled
      ) as has_preview,
      exists (select 1 from managed_desk) as has_desk
  )
  select
    case
      when access.is_master and access.has_desk then 'combined'
      when access.has_master_role and access.has_preview then 'master_preview'
      when access.is_master then 'master'
      when access.has_desk then 'desk'
      else 'none'
    end as scope,
    case when access.has_desk then (select id from managed_desk) else null end as desk_id,
    case when access.has_desk then (select name from managed_desk) else null end as desk_name
  from access;
$$;

comment on table public.nodal_admin_panel_previews is
  'Excepciones auditables para visualizar el panel Admin sin una mesa asignada.';

comment on function public.get_my_administration_scope() is
  'Returns cumulative MFA-protected master, managed desk, preview, or no administration scope.';

revoke all on function public.get_my_administration_scope() from public, anon;
grant execute on function public.get_my_administration_scope() to authenticated;
