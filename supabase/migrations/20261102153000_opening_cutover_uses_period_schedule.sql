-- La apertura debe respetar el calendario operativo del período, no el mes
-- calendario usado como etiqueta. Por ejemplo, octubre-noviembre 2026 cierra
-- el 13/11 y una apertura confirmada el 02/11 sigue perteneciendo al período.

create or replace function public.confirm_nodal_period_opening(
  target_period_id uuid,
  target_start_mode text,
  target_cutover_date date,
  target_broker_balance_cents bigint,
  target_funding_pending_cents bigint,
  target_contributed_capital_cents bigint,
  target_personal_withdrawals_cents bigint,
  target_floating_cents bigint,
  target_virgin_accounts integer,
  target_live_evaluation_accounts integer,
  target_funded_accounts integer,
  target_closed_accounts_reference integer,
  target_batches jsonb default '[]'::jsonb,
  target_wallets jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_workspace_id uuid;
  selected_start_on date;
  selected_close_on date;
  snapshot_id uuid;
  batch jsonb;
  wallet jsonb;
  wallet_id uuid;
  wallet_total bigint := 0;
  stored_contributed bigint;
  inferred_result bigint;
begin
  if actor_id is null or not public.can_access_period(target_period_id) then
    raise exception 'selected period is not accessible';
  end if;

  select periods.workspace_id, periods.operational_start_on, periods.scheduled_close_at::date
  into selected_workspace_id, selected_start_on, selected_close_on
  from public.periods periods
  join public.workspaces spaces on spaces.id = periods.workspace_id
  where periods.id = target_period_id
    and spaces.owner_user_id = actor_id
    and spaces.modality = 'real';

  if not found then raise exception 'opening is only available for the real workspace'; end if;
  if target_start_mode not in ('zero', 'reconstruct')
    or target_cutover_date is null
    or selected_start_on is null
    or selected_close_on is null
    or target_cutover_date < selected_start_on
    or target_cutover_date > selected_close_on then
    raise exception 'opening date or mode is invalid';
  end if;
  if target_broker_balance_cents is null or target_broker_balance_cents < 0
    or target_funding_pending_cents < 0 or target_contributed_capital_cents < 0
    or target_personal_withdrawals_cents < 0 or target_floating_cents < 0
    or target_virgin_accounts < 0 or target_live_evaluation_accounts < 0
    or target_funded_accounts < 0 or target_closed_accounts_reference < 0 then
    raise exception 'opening values are invalid';
  end if;
  if target_batches is null or jsonb_typeof(target_batches) <> 'array'
    or target_wallets is null or jsonb_typeof(target_wallets) <> 'array' then
    raise exception 'opening collections are invalid';
  end if;
  if exists (
    select 1 from jsonb_array_elements(target_wallets) wallet_value
    group by lower(btrim(wallet_value ->> 'name')) having count(*) > 1
  ) then raise exception 'wallet names must be unique'; end if;

  for wallet in select value from jsonb_array_elements(target_wallets)
  loop
    if nullif(btrim(wallet ->> 'name'), '') is null
      or coalesce((wallet ->> 'balanceInCents')::bigint, -1) < 0 then
      raise exception 'opening wallet is invalid';
    end if;
    wallet_total := wallet_total + (wallet ->> 'balanceInCents')::bigint;
  end loop;

  if exists(select 1 from public.period_opening_snapshots where period_id = target_period_id) then
    raise exception 'opening was already confirmed';
  end if;
  if exists(select 1 from public.accounts where period_id = target_period_id)
    or exists(select 1 from public.daily_controls where period_id = target_period_id)
    or exists(select 1 from public.operation_entries where period_id = target_period_id)
    or exists(select 1 from public.wallet_movements where period_id = target_period_id)
    or exists(select 1 from public.funding_withdrawals where period_id = target_period_id) then
    raise exception 'opening cannot be confirmed after period activity exists';
  end if;

  stored_contributed := case when target_start_mode = 'zero'
    then target_broker_balance_cents else target_contributed_capital_cents end;
  inferred_result := target_broker_balance_cents + wallet_total + target_funding_pending_cents
    - case when target_start_mode = 'zero'
        then stored_contributed + wallet_total
        else stored_contributed - target_personal_withdrawals_cents end;

  insert into public.period_opening_snapshots(
    period_id, start_mode, cutover_date, broker_balance_cents, wallet_balance_cents,
    funding_pending_cents, contributed_capital_cents, personal_withdrawals_cents,
    prior_realized_result_cents, floating_cents, virgin_accounts,
    live_evaluation_accounts, funded_accounts, closed_accounts_reference, created_by
  ) values (
    target_period_id, target_start_mode, target_cutover_date, target_broker_balance_cents,
    wallet_total, target_funding_pending_cents, stored_contributed,
    target_personal_withdrawals_cents, inferred_result, target_floating_cents,
    target_virgin_accounts, target_live_evaluation_accounts, target_funded_accounts,
    target_closed_accounts_reference, actor_id
  ) returning id into snapshot_id;

  for wallet in select value from jsonb_array_elements(target_wallets)
  loop
    insert into public.nodal_wallets(workspace_id, name, created_by, updated_by)
    values(selected_workspace_id, btrim(wallet ->> 'name'), actor_id, actor_id)
    on conflict (workspace_id, name) do update set is_active = true, updated_by = actor_id, updated_at = now()
    returning id into wallet_id;
    insert into public.period_opening_wallets(opening_snapshot_id, wallet_id, balance_cents)
    values(snapshot_id, wallet_id, (wallet ->> 'balanceInCents')::bigint);
  end loop;

  for batch in select value from jsonb_array_elements(target_batches)
  loop
    insert into public.period_opening_account_batches(
      opening_snapshot_id, company_name, account_size_cents, stage, account_count,
      cost_per_account_cents, current_cash_value_cents
    ) values (
      snapshot_id, btrim(batch ->> 'companyName'),
      (batch ->> 'accountSizeInCents')::bigint, batch ->> 'stage',
      (batch ->> 'accountCount')::integer,
      coalesce((batch ->> 'costPerAccountInCents')::bigint, 0),
      nullif(batch ->> 'currentCashValueInCents', '')::bigint
    );
  end loop;

  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values(actor_id, 'period_opening_snapshots', snapshot_id, 'period_opening_confirmed',
    (select to_jsonb(opening) from public.period_opening_snapshots opening where opening.id = snapshot_id)
      || jsonb_build_object('batches', target_batches, 'wallets', target_wallets),
    'Punto de partida conciliado y confirmado por el usuario');
  return snapshot_id;
end;
$$;

revoke all on function public.confirm_nodal_period_opening(
  uuid,text,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,jsonb,jsonb
) from public, anon;
grant execute on function public.confirm_nodal_period_opening(
  uuid,text,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,jsonb,jsonb
) to authenticated;

comment on function public.confirm_nodal_period_opening(
  uuid,text,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,jsonb,jsonb
) is 'Confirma una apertura dentro de las fechas operativas programadas del período.';
