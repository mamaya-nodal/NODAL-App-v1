-- PostgREST expone hoy el rol autenticado mediante auth.role(). La funcion de
-- cierre original conserva una comprobacion compatible con instalaciones
-- anteriores, por lo que este adaptador privado normaliza el claim antes de
-- delegar en la transaccion atomica existente.

create or replace function public.close_nodal_accounting_period_as_service(
  target_period_id uuid,
  target_summary jsonb,
  target_has_observations boolean,
  target_reason text default 'Cierre contable automático'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);

  return public.close_nodal_accounting_period(
    target_period_id,
    target_summary,
    target_has_observations,
    target_reason
  );
end;
$$;

revoke all on function public.close_nodal_accounting_period_as_service(uuid, jsonb, boolean, text)
from public, anon, authenticated;
grant execute on function public.close_nodal_accounting_period_as_service(uuid, jsonb, boolean, text)
to service_role;

revoke all on function public.close_nodal_accounting_period(uuid, jsonb, boolean, text)
from public, anon, authenticated;
grant execute on function public.close_nodal_accounting_period(uuid, jsonb, boolean, text)
to service_role;
