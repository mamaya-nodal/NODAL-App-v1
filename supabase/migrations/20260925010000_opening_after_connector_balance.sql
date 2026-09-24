-- El primer saldo broker detectado por Ninja es una referencia provisional.
-- No debe impedir que un usuario recién reconectado confirme su apertura.

do $$
begin
  if to_regprocedure('public.commit_ninja_initial_broker_balance_legacy(uuid,text)') is null then
    alter function public.commit_ninja_initial_broker_balance(uuid, text)
    rename to commit_ninja_initial_broker_balance_legacy;
  end if;
end;
$$;

revoke all on function public.commit_ninja_initial_broker_balance_legacy(uuid, text)
from public, anon, authenticated;
grant execute on function public.commit_ninja_initial_broker_balance_legacy(uuid, text)
to service_role;

create or replace function public.commit_ninja_initial_broker_balance(
  target_connector_id uuid,
  target_source_event_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  select connectors.owner_user_id into owner_id
  from public.ninja_connectors connectors
  where connectors.id = target_connector_id
    and connectors.status = 'active';

  if owner_id is null then return false; end if;

  -- Una apertura confirmada ya representa el saldo inicial. Las variaciones
  -- posteriores deben conciliarse, nunca recrearse como aporte inicial.
  if exists (
    select 1
    from public.period_opening_snapshots snapshots
    join public.periods periods on periods.id = snapshots.period_id
    join public.workspaces spaces on spaces.id = periods.workspace_id
    where spaces.owner_user_id = owner_id
      and spaces.modality::text = 'real'
  ) then return false; end if;

  return public.commit_ninja_initial_broker_balance_legacy(
    target_connector_id,
    target_source_event_id
  );
end;
$$;

revoke all on function public.commit_ninja_initial_broker_balance(uuid, text)
from public, anon, authenticated;
grant execute on function public.commit_ninja_initial_broker_balance(uuid, text)
to service_role;

create or replace function public.confirm_nodal_period_opening_after_connector(
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
  actor_id uuid := (select auth.uid());
  provisional_control_ids uuid[] := '{}'::uuid[];
begin
  if actor_id is null or not public.can_access_period(target_period_id) then
    raise exception 'selected period is not accessible';
  end if;

  select coalesce(array_agg(controls.id), '{}'::uuid[])
  into provisional_control_ids
  from public.daily_controls controls
  where controls.period_id = target_period_id
    and controls.control_number = 1
    and controls.kind = 'deposit'
    and controls.origin_destination = 'Aporte trader'
    and controls.source = 'ninjatrader'
    and controls.source_event_key like 'ninja-balance:%';

  if cardinality(provisional_control_ids) > 1
    or exists (
      select 1 from public.daily_controls controls
      where controls.period_id = target_period_id
        and not (controls.id = any(provisional_control_ids))
    ) then
    raise exception 'opening cannot be confirmed after period activity exists';
  end if;

  -- El llamado a la función existente ocurre en esta misma transacción. Si la
  -- apertura falla, estas eliminaciones también se revierten.
  if cardinality(provisional_control_ids) = 1 then
    delete from public.ninja_broker_balance_events
    where daily_control_id = any(provisional_control_ids);
    delete from public.daily_controls
    where id = any(provisional_control_ids);
  end if;

  return public.confirm_nodal_period_opening(
    target_period_id,
    target_start_mode,
    target_cutover_date,
    target_broker_balance_cents,
    target_funding_pending_cents,
    target_contributed_capital_cents,
    target_personal_withdrawals_cents,
    target_floating_cents,
    target_virgin_accounts,
    target_live_evaluation_accounts,
    target_funded_accounts,
    target_closed_accounts_reference,
    target_batches,
    target_wallets
  );
end;
$$;

revoke all on function public.confirm_nodal_period_opening_after_connector(
  uuid,text,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,jsonb,jsonb
) from public, anon;
grant execute on function public.confirm_nodal_period_opening_after_connector(
  uuid,text,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,jsonb,jsonb
) to authenticated;
