-- La confirmacion original debe conservar en el historial el resultado que
-- tenia al ocurrir, aunque luego el control haya sido corregido.

create or replace function public.list_nodal_period_activity(target_period_id uuid)
returns table (
  audit_event_id bigint,
  occurred_at timestamptz,
  action text,
  entity_id uuid,
  control_number integer,
  purchase_number integer,
  operated_on date,
  company_name text,
  account_reference integer,
  control_kind text,
  phase text,
  primary_amount_cents bigint,
  balance_after_cents bigint,
  funds_origin text,
  reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    events.id,
    events.occurred_at,
    events.action,
    events.entity_id,
    controls.control_number,
    purchases.purchase_number,
    coalesce(controls.operated_on, purchases.purchased_on),
    companies.display_name,
    accounts.reference_number,
    controls.kind::text,
    controls.phase::text,
    case
      when events.action = 'purchase_created' then purchases.price_cents
      when events.action in (
        'daily_control_confirmed',
        'daily_control_confirmed_custom_allocation'
      ) and controls.kind = 'balance_update'
        then nullif(events.current_data ->> 'operating_result_cents', '')::bigint
      when events.action in (
        'daily_control_confirmed',
        'daily_control_confirmed_custom_allocation'
      ) then controls.movement_cents
      else null
    end,
    case
      when events.action in (
        'daily_control_confirmed',
        'daily_control_confirmed_custom_allocation'
      ) then nullif(events.current_data ->> 'balance_after_cents', '')::bigint
      else null
    end,
    purchases.funds_origin::text,
    case
      when events.action in (
        'daily_control_balance_corrected',
        'daily_control_balance_corrected_with_allocations'
      ) then events.reason
      when events.action = 'daily_control_confirmed_custom_allocation'
        then events.reason
      else null
    end
  from public.audit_events as events
  left join public.purchases as purchases
    on events.entity_table = 'purchases'
    and purchases.id = events.entity_id
    and purchases.period_id = target_period_id
  left join public.daily_controls as controls
    on events.entity_table = 'daily_controls'
    and controls.id = events.entity_id
    and controls.period_id = target_period_id
  left join public.accounts as accounts
    on accounts.id = coalesce(purchases.account_id, controls.leader_account_id)
  left join public.companies as companies
    on companies.id = accounts.company_id
  where auth.uid() is not null
    and public.can_access_period(target_period_id)
    and coalesce(purchases.period_id, controls.period_id) = target_period_id
    and events.action in (
      'purchase_created',
      'daily_control_confirmed',
      'daily_control_confirmed_custom_allocation',
      'daily_control_balance_corrected',
      'daily_control_balance_corrected_with_allocations'
    )
  order by events.occurred_at desc, events.id desc;
$$;

