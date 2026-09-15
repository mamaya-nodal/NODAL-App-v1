-- El primer saldo broker verificado reemplaza la carga manual del depósito
-- inicial. Se conserva como Control Diario y como evento Ninja auditable.

alter table public.daily_controls
  drop constraint if exists daily_controls_kind_shape;

alter table public.daily_controls
  add constraint daily_controls_kind_shape check (
    (
      kind in ('deposit', 'withdrawal')
      and movement_cents is not null
      and origin_destination is not null
      and operating_result_cents is null
      and company_id is null
      and leader_account_id is null
      and phase is null
      and (
        (
          source = 'manual'
          and source_event_key is null
          and received_balance_cents is null
          and sync_issue_reason is null
        )
        or (
          kind = 'deposit'
          and source = 'ninjatrader'
          and source_event_key is not null
          and received_balance_cents = balance_after_cents
          and sync_issue_reason is null
        )
      )
    )
    or
    (
      kind = 'balance_update'
      and movement_cents is null
      and origin_destination is null
      and balance_before_cents is not null
      and operating_result_cents is not null
      and company_id is not null
      and leader_account_id is not null
      and phase is not null
      and (
        (
          source = 'manual'
          and source_event_key is null
          and received_balance_cents is null
          and sync_issue_reason is null
        )
        or (
          source = 'ninjatrader'
          and source_event_key is not null
          and received_balance_cents is not null
          and (
            (received_balance_cents = balance_after_cents and sync_issue_reason is null)
            or (received_balance_cents is distinct from balance_after_cents and sync_issue_reason is not null)
          )
        )
      )
    )
  );

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
  selected_event public.ninja_broker_balance_events%rowtype;
  owner_id uuid;
  target_period_id uuid;
  new_control_id uuid;
  event_key text;
  event_date date;
begin
  select connectors.owner_user_id
  into owner_id
  from public.ninja_connectors connectors
  where connectors.id = target_connector_id
    and connectors.status = 'active';

  if owner_id is null then return false; end if;

  select events.*
  into selected_event
  from public.ninja_broker_balance_events events
  where events.connector_id = target_connector_id
    and events.source_event_id = btrim(target_source_event_id)
  for update;

  if not found then return false; end if;
  if selected_event.status = 'confirmed' then return true; end if;

  event_key := 'ninja-balance:' || selected_event.id::text;
  event_date := (selected_event.observed_at at time zone 'America/Argentina/Buenos_Aires')::date;

  select periods.id into target_period_id
  from public.periods periods
  join public.workspaces spaces on spaces.id = periods.workspace_id
  where spaces.owner_user_id = owner_id
    and spaces.modality::text = 'real'
    and periods.period_month = date_trunc('month', event_date)::date
  order by periods.created_at
  limit 1
  for update of periods;

  if target_period_id is null then return false; end if;

  select controls.id into new_control_id
  from public.daily_controls controls
  where controls.period_id = target_period_id
    and controls.source = 'ninjatrader'
    and controls.source_event_key = event_key;

  if new_control_id is null then
    -- Sólo la primera referencia histórica puede transformarse en aporte. Si
    -- ya existe contabilidad, el evento permanece pendiente de conciliación.
    if exists (
      select 1
      from public.daily_controls controls
      join public.periods periods on periods.id = controls.period_id
      join public.workspaces spaces on spaces.id = periods.workspace_id
      where spaces.owner_user_id = owner_id
        and spaces.modality::text = 'real'
    ) then return false; end if;

    insert into public.daily_controls (
      period_id, control_number, operated_on, kind, movement_cents,
      origin_destination, balance_before_cents, balance_after_cents,
      operating_result_cents, observations, source, source_event_key,
      received_balance_cents, confirmation_key, created_by
    ) values (
      target_period_id, 1, event_date, 'deposit', selected_event.balance_cents,
      'Aporte trader', null, selected_event.balance_cents,
      null, 'Saldo inicial detectado automáticamente por NinjaTrader',
      'ninjatrader', event_key, selected_event.balance_cents,
      selected_event.id, owner_id
    ) returning id into new_control_id;

    insert into public.audit_events(
      actor_user_id, entity_table, entity_id, action, current_data, reason
    ) values (
      owner_id, 'daily_controls', new_control_id,
      'ninja_initial_broker_balance_committed',
      jsonb_build_object(
        'period_id', target_period_id,
        'balance_cents', selected_event.balance_cents,
        'ninja_event_id', selected_event.id,
        'source_accounts', selected_event.source_accounts
      ),
      'Primer saldo broker incorporado automáticamente al período'
    );
  end if;

  update public.ninja_broker_balance_events
  set status = 'confirmed', daily_control_id = new_control_id, resolved_at = now()
  where id = selected_event.id;

  return true;
end;
$$;

revoke all on function public.commit_ninja_initial_broker_balance(uuid, text)
from public, anon, authenticated;
grant execute on function public.commit_ninja_initial_broker_balance(uuid, text)
to service_role;
