-- Corrección auditable de costo y origen antes de la primera operación.

create or replace function public.nodal_registered_account_has_activity(
  target_account_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists(select 1 from public.daily_controls where leader_account_id = target_account_id)
    or exists(select 1 from public.daily_control_participants where account_id = target_account_id)
    or exists(select 1 from public.operation_entries where account_id = target_account_id)
    or exists(select 1 from public.account_phase_withdrawals where account_id = target_account_id)
    or exists(select 1 from public.manual_account_balance_observations where account_id = target_account_id)
    or exists(select 1 from public.funding_withdrawals where account_id = target_account_id)
    or exists(select 1 from public.ninja_operation_batch_members where account_id = target_account_id)
    or exists(select 1 from public.ninja_operation_batch_manual_accounts where account_id = target_account_id)
    or exists(
      select 1
      from public.ninja_account_links links
      join public.ninja_operation_probe_sessions sessions
        on sessions.connector_id = links.connector_id
        and sessions.connection_name = links.connection_name
        and sessions.account_name = links.external_account_name
        and sessions.excluded_at is null
      where links.account_id = target_account_id
    );
$$;

revoke all on function public.nodal_registered_account_has_activity(uuid)
from public, anon, authenticated;

create or replace function public.update_nodal_unused_account_purchase(
  target_account_id uuid,
  target_price_cents bigint,
  target_funds_origin public.purchase_funds_origin,
  target_wallet_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_account public.accounts%rowtype;
  selected_purchase public.purchases%rowtype;
  selected_workspace_id uuid;
  available_wallet_cents bigint;
  previous_data jsonb;
  current_data jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication is required';
  end if;
  if target_price_cents is null or target_price_cents < 0 then
    raise exception 'unused_account_purchase_price_invalid';
  end if;

  select accounts.*
  into selected_account
  from public.accounts accounts
  join public.periods periods on periods.id = accounts.period_id
  where accounts.id = target_account_id
    and public.can_access_workspace(periods.workspace_id)
  for update of accounts;
  if not found then
    raise exception 'unused_account_purchase_not_available';
  end if;
  select periods.workspace_id
  into selected_workspace_id
  from public.periods periods
  where periods.id = selected_account.period_id;

  select purchases.*
  into selected_purchase
  from public.purchases purchases
  where purchases.account_id = target_account_id
  for update;
  if not found then
    raise exception 'unused_account_purchase_not_available';
  end if;

  if public.nodal_registered_account_has_activity(target_account_id) then
    raise exception 'unused_account_purchase_has_activity';
  end if;

  if target_funds_origin = 'Saldo generado' then
    if target_wallet_id is null then
      raise exception 'unused_account_purchase_wallet_required';
    end if;
    perform 1
    from public.nodal_wallets wallets
    where wallets.id = target_wallet_id
      and wallets.workspace_id = selected_workspace_id
      and wallets.is_active
    for update;
    if not found then
      raise exception 'unused_account_purchase_wallet_not_available';
    end if;

    available_wallet_cents := public.calculate_nodal_wallet_balance(target_wallet_id)
      + case when selected_purchase.wallet_id = target_wallet_id then selected_purchase.price_cents else 0 end;
    if available_wallet_cents < target_price_cents then
      raise exception 'unused_account_purchase_wallet_insufficient';
    end if;
  elsif target_wallet_id is not null then
    raise exception 'unused_account_purchase_wallet_not_allowed';
  end if;

  previous_data := to_jsonb(selected_purchase);

  update public.purchases purchases
  set price_cents = target_price_cents,
    funds_origin = target_funds_origin,
    wallet_id = case when target_funds_origin = 'Saldo generado' then target_wallet_id else null end,
    updated_by = actor_id,
    updated_at = now()
  where purchases.id = selected_purchase.id
  returning to_jsonb(purchases) into current_data;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action,
    previous_data, current_data, reason
  ) values (
    actor_id, 'purchases', selected_purchase.id, 'unused_account_purchase_corrected',
    previous_data, current_data,
    'Costo u origen corregidos antes de la primera operación'
  );

  return true;
end;
$$;

revoke all on function public.update_nodal_unused_account_purchase(
  uuid, bigint, public.purchase_funds_origin, uuid
) from public, anon;
grant execute on function public.update_nodal_unused_account_purchase(
  uuid, bigint, public.purchase_funds_origin, uuid
) to authenticated;

comment on function public.update_nodal_unused_account_purchase(
  uuid, bigint, public.purchase_funds_origin, uuid
) is 'Corrige costo, origen y billetera de una compra sólo antes de cualquier actividad de la cuenta.';

create or replace function public.delete_nodal_registered_account(
  target_account_id uuid,
  management_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_account public.accounts%rowtype;
  selected_workspace_id uuid;
  normalized_reason text := nullif(btrim(management_reason), '');
  links_snapshot jsonb;
  purchase_snapshot jsonb;
  identity_snapshot jsonb;
  selected_link public.ninja_account_links%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required';
  end if;
  if normalized_reason is null or length(normalized_reason) > 500 then
    raise exception 'registered_account_reason_invalid';
  end if;

  select accounts.*
  into selected_account
  from public.accounts accounts
  join public.periods periods on periods.id = accounts.period_id
  where accounts.id = target_account_id
    and public.can_access_workspace(periods.workspace_id)
  for update of accounts;

  if not found then
    raise exception 'registered_account_not_available';
  end if;
  select periods.workspace_id
  into selected_workspace_id
  from public.periods periods
  where periods.id = selected_account.period_id;
  if selected_account.state not in ('virgin', 'closed') then
    raise exception 'registered_account_state_not_deletable';
  end if;

  if public.nodal_registered_account_has_activity(target_account_id) then
    raise exception 'registered_account_has_activity';
  end if;

  select coalesce(jsonb_agg(to_jsonb(links) order by links.linked_at), '[]'::jsonb)
  into links_snapshot
  from public.ninja_account_links links
  where links.account_id = target_account_id;

  select to_jsonb(purchases)
  into purchase_snapshot
  from public.purchases purchases
  where purchases.account_id = target_account_id;

  select coalesce(jsonb_agg(to_jsonb(assignments) order by assignments.assigned_at), '[]'::jsonb)
  into identity_snapshot
  from public.identity_account_assignments assignments
  where assignments.account_id = target_account_id;

  for selected_link in
    select links.*
    from public.ninja_account_links links
    where links.account_id = target_account_id
  loop
    if selected_link.connector_id is not null then
      insert into public.ninja_account_registration_exclusions(
        owner_user_id, connector_id, connection_name,
        external_account_name, reason, created_by
      ) values (
        actor_id, selected_link.connector_id, btrim(selected_link.connection_name),
        btrim(selected_link.external_account_name), normalized_reason, actor_id
      )
      on conflict(owner_user_id, connector_id, connection_name, external_account_name)
      do update set reason = excluded.reason, created_by = excluded.created_by, created_at = now();
    end if;
  end loop;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, previous_data, reason
  ) values (
    actor_id, 'accounts', target_account_id, 'registered_account_deleted',
    jsonb_build_object(
      'account', to_jsonb(selected_account),
      'purchase', purchase_snapshot,
      'ninja_links', links_snapshot,
      'identity_assignments', identity_snapshot,
      'workspace_id', selected_workspace_id
    ),
    normalized_reason
  );

  delete from public.identity_account_assignments where account_id = target_account_id;
  delete from public.ninja_account_links where account_id = target_account_id;
  delete from public.purchases where account_id = target_account_id;
  delete from public.accounts where id = target_account_id;

  return true;
end;
$$;

revoke all on function public.delete_nodal_registered_account(uuid, text)
from public, anon;
grant execute on function public.delete_nodal_registered_account(uuid, text)
to authenticated;

