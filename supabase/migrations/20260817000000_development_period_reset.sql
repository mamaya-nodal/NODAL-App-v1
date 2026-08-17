-- Reinicio exclusivamente para ensayos locales de un período propio y actual.
-- Conserva la auditoría existente y deja un evento resumido del reinicio.
create or replace function public.reset_nodal_development_period(target_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_period_month date;
  deleted_accounts integer := 0;
  deleted_controls integer := 0;
  deleted_purchases integer := 0;
begin
  if actor_id is null or not public.can_access_period(target_period_id) then
    raise exception 'period access denied';
  end if;

  select periods.period_month into target_period_month
  from public.periods as periods where periods.id = target_period_id;
  if target_period_month is null
    or target_period_month <> date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'only the current period can be reset during development';
  end if;

  select count(*) into deleted_accounts from public.accounts where period_id = target_period_id;
  select count(*) into deleted_controls from public.daily_controls where period_id = target_period_id;
  select count(*) into deleted_purchases from public.purchases where period_id = target_period_id;

  delete from public.ai_diagnostics where period_id = target_period_id;
  delete from public.funding_withdrawals where period_id = target_period_id;
  delete from public.wallet_movements where period_id = target_period_id;
  delete from public.account_phase_withdrawals where period_id = target_period_id;
  delete from public.operation_entries where period_id = target_period_id;
  delete from public.daily_control_participants where period_id = target_period_id;
  delete from public.daily_controls where period_id = target_period_id;
  delete from public.purchases where period_id = target_period_id;
  delete from public.accounts where period_id = target_period_id;

  insert into public.audit_events (actor_user_id, entity_table, entity_id, action, current_data, reason)
  values (
    actor_id,
    'periods',
    target_period_id,
    'development_period_reset',
    jsonb_build_object(
      'deleted_accounts', deleted_accounts,
      'deleted_controls', deleted_controls,
      'deleted_purchases', deleted_purchases
    ),
    'Reinicio local de datos de prueba'
  );

  return jsonb_build_object(
    'deleted_accounts', deleted_accounts,
    'deleted_controls', deleted_controls,
    'deleted_purchases', deleted_purchases
  );
end;
$$;

revoke all on function public.reset_nodal_development_period(uuid) from public, anon;
grant execute on function public.reset_nodal_development_period(uuid) to authenticated;
