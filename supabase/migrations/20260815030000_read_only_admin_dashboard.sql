-- Rol administrativo inicial, limitado a consultar alumnos autorizados.
-- No habilita escrituras economicas ni asignacion de roles desde el navegador.

create type public.nodal_access_role as enum ('student', 'admin');

alter table public.nodal_users
add column access_role public.nodal_access_role not null default 'student';

create function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nodal_users as users
    where users.id = (select auth.uid())
      and users.access_state = 'active'
      and users.access_role = 'admin'
  );
$$;

revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;

drop policy nodal_users_read_own_access on public.nodal_users;
create policy nodal_users_read_own_or_admin
on public.nodal_users for select to authenticated
using (id = (select auth.uid()) or public.is_current_user_admin());

create policy workspaces_read_admin
on public.workspaces for select to authenticated
using (public.is_current_user_admin());

create policy periods_read_admin
on public.periods for select to authenticated
using (public.is_current_user_admin());

create policy accounts_read_admin
on public.accounts for select to authenticated
using (public.is_current_user_admin());

create policy purchases_read_admin
on public.purchases for select to authenticated
using (public.is_current_user_admin());

create policy daily_controls_read_admin
on public.daily_controls for select to authenticated
using (public.is_current_user_admin());

create policy daily_control_participants_read_admin
on public.daily_control_participants for select to authenticated
using (public.is_current_user_admin());

create policy operation_entries_read_admin
on public.operation_entries for select to authenticated
using (public.is_current_user_admin());

create policy account_phase_withdrawals_read_admin
on public.account_phase_withdrawals for select to authenticated
using (public.is_current_user_admin());

create policy wallet_movements_read_admin
on public.wallet_movements for select to authenticated
using (public.is_current_user_admin());

create policy funding_withdrawals_read_admin
on public.funding_withdrawals for select to authenticated
using (public.is_current_user_admin());
