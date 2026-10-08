-- APP-173: una aprobación nunca hereda el valor histórico de Identidades.
-- La capacidad se concede únicamente después, desde Admin o Admin Master.

create or replace function public.disable_identities_on_access_activation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.access_state = 'active'::public.nodal_access_state
    and old.access_state is distinct from 'active'::public.nodal_access_state then
    new.identities_enabled := false;
  end if;
  return new;
end;
$$;

drop trigger if exists disable_identities_on_access_activation
on public.nodal_users;

create trigger disable_identities_on_access_activation
before update of access_state on public.nodal_users
for each row
execute function public.disable_identities_on_access_activation();

revoke all on function public.disable_identities_on_access_activation()
from public, anon, authenticated;

comment on function public.disable_identities_on_access_activation() is
  'Fuerza Identidades deshabilitadas al pasar de pendiente/revocado a activo; Admin o Admin Master pueden habilitarla después.';
