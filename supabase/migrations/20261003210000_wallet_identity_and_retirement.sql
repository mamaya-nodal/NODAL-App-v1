-- Clasificacion informativa por identidad y retiro seguro de billeteras.
-- La identidad no altera el libro del titular ni los saldos calculados.

create function public.assign_nodal_wallet_identity(
  target_wallet_id uuid,
  target_identity_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_workspace uuid;
  previous public.nodal_wallet_sources;
begin
  select wallets.workspace_id
  into selected_workspace
  from public.nodal_wallets wallets
  join public.workspaces spaces on spaces.id = wallets.workspace_id
  where wallets.id = target_wallet_id
    and wallets.is_active
    and spaces.owner_user_id = actor_id
    and public.can_access_workspace(wallets.workspace_id)
  for update of wallets;

  if not found then raise exception 'Wallet not available'; end if;

  if target_identity_id is not null and not exists (
    select 1 from public.nodal_identities identities
    where identities.id = target_identity_id
      and identities.workspace_id = selected_workspace
  ) then
    raise exception 'Identity not available';
  end if;

  select * into previous
  from public.nodal_wallet_sources
  where wallet_id = target_wallet_id;

  insert into public.nodal_wallet_sources(wallet_id, workspace_id, identity_id, address)
  values(target_wallet_id, selected_workspace, target_identity_id, null)
  on conflict(wallet_id) do update set identity_id = excluded.identity_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
  ) values (
    actor_id, 'nodal_wallet_sources', target_wallet_id, 'wallet_identity_assigned',
    to_jsonb(previous), jsonb_build_object('identity_id', target_identity_id),
    'Clasificacion informativa de la billetera; no modifica el libro del titular'
  );

  return true;
end;
$$;

create function public.retire_nodal_wallet(target_wallet_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected public.nodal_wallets%rowtype;
  balance_cents bigint;
  has_history boolean;
begin
  select wallets.*
  into selected
  from public.nodal_wallets wallets
  join public.workspaces spaces on spaces.id = wallets.workspace_id
  where wallets.id = target_wallet_id
    and wallets.is_active
    and spaces.owner_user_id = actor_id
    and public.can_access_workspace(wallets.workspace_id)
  for update of wallets;

  if not found then raise exception 'Wallet not available'; end if;

  select public.calculate_nodal_wallet_balance(target_wallet_id) into balance_cents;
  if coalesce(balance_cents, 0) <> 0 then raise exception 'Wallet balance must be zero'; end if;

  select
    exists(select 1 from public.wallet_movements where wallet_id = target_wallet_id or destination_wallet_id = target_wallet_id)
    or exists(select 1 from public.funding_withdrawals where wallet_id = target_wallet_id)
    or exists(select 1 from public.purchases where wallet_id = target_wallet_id)
    or exists(select 1 from public.daily_controls where wallet_id = target_wallet_id)
    or exists(select 1 from public.period_opening_wallets where wallet_id = target_wallet_id)
    or exists(select 1 from public.nodal_wallet_observations where wallet_id = target_wallet_id)
  into has_history;

  if has_history then
    update public.nodal_wallets
    set is_active = false, updated_by = actor_id
    where id = target_wallet_id;

    insert into public.audit_events(
      actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
    ) values (
      actor_id, 'nodal_wallets', target_wallet_id, 'wallet_archived',
      to_jsonb(selected), jsonb_build_object('is_active', false),
      'Billetera retirada con saldo cero; se conserva su historia economica'
    );
    return 'archived';
  end if;

  delete from public.nodal_wallet_sources where wallet_id = target_wallet_id;
  delete from public.nodal_wallets where id = target_wallet_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, previous_data, reason
  ) values (
    actor_id, 'nodal_wallets', target_wallet_id, 'wallet_deleted',
    to_jsonb(selected), 'Billetera sin saldo ni actividad eliminada por el titular'
  );

  return 'deleted';
end;
$$;

revoke all on function public.assign_nodal_wallet_identity(uuid, uuid) from public, anon;
revoke all on function public.retire_nodal_wallet(uuid) from public, anon;
grant execute on function public.assign_nodal_wallet_identity(uuid, uuid) to authenticated;
grant execute on function public.retire_nodal_wallet(uuid) to authenticated;
