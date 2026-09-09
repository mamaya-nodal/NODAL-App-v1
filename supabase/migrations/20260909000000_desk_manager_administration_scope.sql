-- Desk administration is an additional capability. It never replaces the
-- user's personal trading access or changes the desk where the user operates.
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
    where terms.effective_month <= date_trunc(
      'month',
      now() at time zone 'America/Argentina/Buenos_Aires'
    )::date
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
  )
  select
    case
      when exists (select 1 from active_user where access_role = 'admin') then 'master'
      when exists (select 1 from managed_desk) then 'desk'
      else 'none'
    end as scope,
    case
      when exists (select 1 from active_user where access_role = 'admin') then null
      else (select id from managed_desk)
    end as desk_id,
    case
      when exists (select 1 from active_user where access_role = 'admin') then null
      else (select name from managed_desk)
    end as desk_name;
$$;

comment on function public.get_my_administration_scope() is
  'Returns master, current managed desk, or none for the authenticated active user.';

revoke all on function public.get_my_administration_scope() from public, anon;
grant execute on function public.get_my_administration_scope() to authenticated;

