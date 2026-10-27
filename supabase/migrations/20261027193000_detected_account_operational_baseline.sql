-- Conserva el punto operativo declarado al registrar una cuenta ya iniciada.
-- `completed_trade_days` representa el último día completado en esa vuelta;
-- por lo tanto, el próximo cierre se registra con el número siguiente.

alter table public.ninja_account_links
  add column if not exists accounting_phase public.operation_phase,
  add column if not exists completed_trade_days integer;

alter table public.ninja_account_links
  add constraint ninja_account_links_completed_trade_days_check
  check (completed_trade_days is null or completed_trade_days >= 0);

create or replace function public.create_nodal_detected_purchase_with_progress(
  target_period_id uuid,
  target_company_id uuid,
  target_price_cents bigint,
  target_funds_origin public.purchase_funds_origin,
  target_purchased_on date,
  target_connector_id uuid,
  target_connection_name text,
  target_external_account_name text,
  target_first_seen_at timestamptz,
  target_accounting_phase public.operation_phase,
  target_completed_trade_days integer,
  target_wallet_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  created_purchase_id uuid;
  created_account_id uuid;
  detected_phase text;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;
  if target_accounting_phase is null or target_completed_trade_days is null or target_completed_trade_days < 0 then
    raise exception 'Invalid operational baseline';
  end if;

  detected_phase := public.nodal_detected_ninja_phase(target_external_account_name);
  if detected_phase = 'Evaluation' and target_accounting_phase <> 'Evaluacion' then
    raise exception 'Evaluation account requires evaluation phase';
  end if;
  if detected_phase in ('Funded', 'Live') and target_accounting_phase = 'Evaluacion' then
    raise exception 'Funded account requires funded round';
  end if;

  created_purchase_id := public.create_nodal_detected_purchase(
    target_period_id,
    target_company_id,
    target_price_cents,
    target_funds_origin,
    target_purchased_on,
    target_connector_id,
    target_connection_name,
    target_external_account_name,
    target_first_seen_at
  );

  if target_funds_origin = 'Saldo generado' then
    if target_wallet_id is null then raise exception 'Wallet is required'; end if;
    perform public.assign_nodal_purchase_wallet(created_purchase_id, target_wallet_id);
  elsif target_wallet_id is not null then
    raise exception 'Wallet is only valid for generated funds';
  end if;

  select purchases.account_id into created_account_id
  from public.purchases purchases
  where purchases.id = created_purchase_id;

  update public.ninja_account_links links
  set accounting_phase = target_accounting_phase,
      completed_trade_days = target_completed_trade_days
  where links.account_id = created_account_id
    and links.connector_id = target_connector_id
    and links.closed_at is null;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id,
    'ninja_account_links',
    created_account_id,
    'detected_account_operational_baseline_created',
    jsonb_build_object(
      'account_id', created_account_id,
      'accounting_phase', target_accounting_phase,
      'completed_trade_days', target_completed_trade_days,
      'next_trade_day', target_completed_trade_days + 1
    ),
    'Punto operativo confirmado por el usuario al registrar la cuenta detectada'
  );

  return created_purchase_id;
end;
$$;

revoke all on function public.create_nodal_detected_purchase_with_progress(
  uuid, uuid, bigint, public.purchase_funds_origin, date, uuid, text, text,
  timestamptz, public.operation_phase, integer, uuid
) from public, anon;

grant execute on function public.create_nodal_detected_purchase_with_progress(
  uuid, uuid, bigint, public.purchase_funds_origin, date, uuid, text, text,
  timestamptz, public.operation_phase, integer, uuid
) to authenticated;

