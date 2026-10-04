-- Promoción controlada de Ivo a Admin Master después de cancelar la prueba
-- operativa que requería un segundo conector Ninja.
--
-- Conserva su acceso y su fundación vacía. No modifica datos económicos.
-- Requiere confirmación explícita inmediatamente antes de ejecutarse.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '2min';

select pg_advisory_xact_lock(hashtextextended('nodal-promote-ivo-admin-20261004', 0));

do $$
declare
  target_id constant uuid := 'e70a9f26-86ce-42b6-b62c-827c63981254';
  actor_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target public.nodal_users%rowtype;
  workspace_count integer;
  period_count integer;
  account_count integer;
  purchase_count integer;
  control_count integer;
  wallet_count integer;
  connector_count integer;
begin
  select * into target
  from public.nodal_users
  where id = target_id
  for update;

  if not found
    or target.email <> 'ivosebastianpirrone@gmail.com'
    or target.access_state <> 'active'
    or target.access_role <> 'student'
  then
    raise exception 'IVO_ADMIN_PRECONDITION_FAILED';
  end if;

  select count(*) into workspace_count
  from public.workspaces where owner_user_id = target_id;

  select count(*) into period_count
  from public.periods periods
  join public.workspaces workspaces on workspaces.id = periods.workspace_id
  where workspaces.owner_user_id = target_id;

  select count(*) into account_count
  from public.accounts accounts
  join public.workspaces workspaces on workspaces.id = accounts.workspace_id
  where workspaces.owner_user_id = target_id;

  select count(*) into purchase_count
  from public.purchases purchases
  join public.periods periods on periods.id = purchases.period_id
  join public.workspaces workspaces on workspaces.id = periods.workspace_id
  where workspaces.owner_user_id = target_id;

  select count(*) into control_count
  from public.daily_controls controls
  join public.periods periods on periods.id = controls.period_id
  join public.workspaces workspaces on workspaces.id = periods.workspace_id
  where workspaces.owner_user_id = target_id;

  select count(*) into wallet_count
  from public.nodal_wallets wallets
  join public.workspaces workspaces on workspaces.id = wallets.workspace_id
  where workspaces.owner_user_id = target_id;

  select count(*) into connector_count
  from public.ninja_connectors connectors
  where connectors.owner_user_id = target_id;

  if workspace_count <> 2
    or period_count <> 2
    or account_count <> 0
    or purchase_count <> 0
    or control_count <> 0
    or wallet_count <> 0
    or connector_count <> 0
  then
    raise exception
      'IVO_FOUNDATION_NOT_CLEAN: workspaces %, periods %, accounts %, purchases %, controls %, wallets %, connectors %',
      workspace_count,
      period_count,
      account_count,
      purchase_count,
      control_count,
      wallet_count,
      connector_count;
  end if;

  update public.nodal_users
  set access_role = 'admin'
  where id = target_id;

  insert into public.audit_events(
    actor_user_id,
    entity_table,
    entity_id,
    action,
    previous_data,
    current_data,
    reason
  ) values (
    actor_id,
    'nodal_users',
    target_id,
    'admin_role_granted',
    jsonb_build_object(
      'access_role', target.access_role,
      'access_state', target.access_state
    ),
    jsonb_build_object(
      'access_role', 'admin',
      'access_state', target.access_state,
      'workspaces', workspace_count,
      'periods', period_count,
      'accounts', account_count,
      'purchases', purchase_count,
      'daily_controls', control_count,
      'wallets', wallet_count,
      'connectors', connector_count
    ),
    'Prueba operativa cancelada por requerir un segundo conector; Ivo queda limpio y habilitado como Admin Master'
  );
end;
$$;

commit;

select
  users.email,
  users.access_state,
  users.access_role,
  (select count(*) from public.workspaces where owner_user_id = users.id) as workspaces,
  (select count(*) from public.accounts accounts join public.workspaces workspaces on workspaces.id = accounts.workspace_id where workspaces.owner_user_id = users.id) as accounts,
  (select count(*) from public.nodal_wallets wallets join public.workspaces workspaces on workspaces.id = wallets.workspace_id where workspaces.owner_user_id = users.id) as wallets,
  (select count(*) from public.ninja_connectors connectors where connectors.owner_user_id = users.id) as connectors
from public.nodal_users users
where users.id = 'e70a9f26-86ce-42b6-b62c-827c63981254';
