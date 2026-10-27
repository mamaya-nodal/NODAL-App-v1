-- Registra el punto operativo confirmado para las cinco cuentas Lucid de
-- Alejandro Cambieri. Dos participaron del primer trade observado; las otras
-- tres conservan la misma base sin crear movimientos artificiales.

begin;

do $repair$
declare
  alejandro_id constant uuid := 'fb1184da-8f37-4d85-abf1-46e2fb352fef';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_connector_id constant uuid := '00ed1da0-6408-43e0-bd44-ba9204175b95';
  target_period_id constant uuid := '05cf4a58-da2e-46f8-8e2e-b33c3fd5caaa';
  target_company_id constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  target_batch_id constant uuid := '88492e20-f843-4e36-a963-dc7331f167ce';
  committed_control_id uuid;
  changed_count integer;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'periods'
      and events.entity_id = target_period_id
      and events.action = 'alejandro_cambieri_lucid_baseline_repaired'
  ) then
    return;
  end if;

  if (select count(*) from public.ninja_account_links links
      where links.connector_id = target_connector_id
        and links.closed_at is null
        and links.phase = 'Funded'
        and links.external_account_name in (
          'LFF05096533610001',
          'LFF05096533610002',
          'LFF05096533610003',
          'LFF05096533610004',
          'LFF05096533610005'
        )) <> 5 then
    raise exception 'Expected five active Alejandro Cambieri Lucid links';
  end if;

  if (select snapshots.broker_balance_cents
      from public.period_opening_snapshots snapshots
      where snapshots.period_id = target_period_id) is distinct from 311028 then
    raise exception 'Alejandro opening broker balance changed; aborting controlled repair';
  end if;

  if exists (select 1 from public.daily_controls controls where controls.period_id = target_period_id) then
    raise exception 'Alejandro already has daily controls; repair requires review';
  end if;

  if not exists (
    select 1
    from public.ninja_operation_batches batches
    join public.ninja_operation_probe_sessions sessions
      on sessions.id = batches.broker_session_id
    where batches.id = target_batch_id
      and batches.connector_id = target_connector_id
      and batches.status = 'ready'
      and batches.accounting_status = 'blocked'
      and batches.accounting_blocking_reason = 'Falta definir la vuelta contable de una cuenta'
      and batches.broker_result_cents = -107074
      and sessions.opening_balance = 3110.28
      and sessions.closing_balance = 2039.54
      and sessions.result = -1070.74
  ) then
    raise exception 'Expected Alejandro pending batch or broker balances changed';
  end if;

  if (select count(*) from public.ninja_operation_batch_members members
      where members.batch_id = target_batch_id
        and members.role = 'prop'
        and members.account_id is not null
        and members.allocated_broker_result_cents = -53537) <> 2 then
    raise exception 'Expected two equally allocated Alejandro prop members';
  end if;

  update public.ninja_account_links links
  set accounting_phase = 'Primera vuelta', completed_trade_days = 1
  where links.connector_id = target_connector_id
    and links.closed_at is null
    and links.phase = 'Funded'
    and links.external_account_name in (
      'LFF05096533610001',
      'LFF05096533610002',
      'LFF05096533610003',
      'LFF05096533610004',
      'LFF05096533610005'
    );
  get diagnostics changed_count = row_count;
  if changed_count <> 5 then
    raise exception 'Expected to update five Alejandro Lucid baselines, found %', changed_count;
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  )
  select admin_id, 'ninja_account_links', links.account_id,
    'detected_account_operational_baseline_repaired',
    jsonb_build_object(
      'connector_id', target_connector_id,
      'external_account_name', links.external_account_name,
      'accounting_phase', links.accounting_phase,
      'completed_trade_days', links.completed_trade_days,
      'next_trade_day', links.completed_trade_days + 1
    ),
    'Vuelta y dia iniciales confirmados por Mauricio para las cinco cuentas Lucid de Alejandro Cambieri'
  from public.ninja_account_links links
  where links.connector_id = target_connector_id
    and links.closed_at is null
    and links.external_account_name like 'LFF0509653361%';

  update public.ninja_operation_batches batches
  set accounting_mode = 'shadow',
      accounting_status = 'shadow_ready',
      accounting_blocking_reason = null,
      accounting_period_id = target_period_id,
      accounting_company_id = target_company_id,
      accounting_phase = 'Primera vuelta',
      operated_on = '2026-10-27',
      updated_at = now()
  where batches.id = target_batch_id
    and batches.connector_id = target_connector_id
    and batches.accounting_status = 'blocked';
  if not found then raise exception 'Alejandro pending batch was not updated'; end if;

  perform set_config('request.jwt.claim.sub', alejandro_id::text, true);
  committed_control_id := public.commit_ninja_automatic_operation_batch(target_batch_id);
  if committed_control_id is null then
    raise exception 'Alejandro pending batch was not committed';
  end if;

  if not exists (
    select 1 from public.daily_controls controls
    where controls.id = committed_control_id
      and controls.period_id = target_period_id
      and controls.control_number = 1
      and controls.operated_on = '2026-10-27'
      and controls.phase = 'Primera vuelta'
      and controls.balance_before_cents = 311028
      and controls.balance_after_cents = 203954
      and controls.operating_result_cents = -107074
  ) then
    raise exception 'Alejandro committed control does not preserve the verified broker continuity';
  end if;

  if (select count(*) from public.operation_entries entries
      where entries.daily_control_id = committed_control_id
        and entries.phase = 'Primera vuelta'
        and entries.destination = 'NETO BROKER -'
        and entries.magnitude_cents = 53537) <> 2 then
    raise exception 'Expected two Alejandro accounting entries after commit';
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id, 'periods', target_period_id,
    'alejandro_cambieri_lucid_baseline_repaired',
    jsonb_build_object(
      'connector_id', target_connector_id,
      'baseline', jsonb_build_object('phase', 'Primera vuelta', 'completed_trade_days', 1),
      'committed_batch_id', target_batch_id,
      'daily_control_id', committed_control_id,
      'broker_result_cents', -107074,
      'final_broker_balance_cents', 203954,
      'registered_prop_accounts', 5,
      'operated_prop_accounts', 2
    ),
    'Reparacion controlada solicitada por Mauricio: cinco cuentas comparten la base y solo dos reciben el trade observado'
  );
end;
$repair$;

commit;
