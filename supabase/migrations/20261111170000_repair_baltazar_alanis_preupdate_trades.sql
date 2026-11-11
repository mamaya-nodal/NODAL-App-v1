-- Reconstruye dos coberturas de Baltazar operadas con las cinco cuentas
-- Funded de Alanis antes de actualizar el conector de la identidad.
-- El conector anterior transmitió ambos cierres broker, pero no las sesiones
-- prop. La asignación fue confirmada por Mauricio y se aplica en orden.

begin;

create schema if not exists private_baltazar_alanis_repair_20261111;
revoke all on schema private_baltazar_alanis_repair_20261111
from public, anon, authenticated;

create table if not exists private_baltazar_alanis_repair_20261111.ninja_operation_batches as
select *
from public.ninja_operation_batches
where id in (
  '8faac2a9-4282-4462-a65a-894fe15a9728'::uuid,
  '0c06c232-b4de-450e-bfe9-883f34be03ac'::uuid
);

create table if not exists private_baltazar_alanis_repair_20261111.ninja_broker_balance_events as
select events.*
from public.ninja_broker_balance_events events
join public.ninja_operation_batches batches on batches.connector_id = events.connector_id
join public.ninja_operation_probe_sessions sessions on sessions.id = batches.broker_session_id
where batches.id in (
    '8faac2a9-4282-4462-a65a-894fe15a9728'::uuid,
    '0c06c232-b4de-450e-bfe9-883f34be03ac'::uuid
  )
  and events.source_event_id = 'ninja-operation:' || sessions.opening_event_id::text;

do $repair$
declare
  baltazar_id constant uuid := '42c42ea2-c9a9-41c6-8604-5804982c1f50';
  mauricio_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  first_batch constant uuid := '8faac2a9-4282-4462-a65a-894fe15a9728';
  second_batch constant uuid := '0c06c232-b4de-450e-bfe9-883f34be03ac';
  alanis_id constant uuid := '847099d3-ce28-44c3-b0e1-1a90a556b04c';
  account_ids constant uuid[] := array[
    '56581f5d-2e22-422f-acbf-74e5020eb118'::uuid,
    '1d454925-0dcb-45e3-85ad-a330b97cbd7c'::uuid,
    'c4389bb6-6d08-40d2-aa1f-cbbf1cc92b95'::uuid,
    '67480f02-00c7-4f94-b2f2-0a2af1eac14f'::uuid,
    'bd4236f9-e152-4881-8a59-9fc307078557'::uuid
  ];
  first_control uuid;
  second_control uuid;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'ninja_operation_batches'
      and events.entity_id = first_batch
      and events.action = 'baltazar_alanis_preupdate_trades_reconciled'
  ) then
    return;
  end if;

  if (
    select count(*)
    from public.ninja_operation_batches batches
    where (batches.id = first_batch and batches.broker_result_cents = -10574)
       or (batches.id = second_batch and batches.broker_result_cents = -10074)
  ) <> 2 then
    raise exception 'Expected both verified Baltazar broker batches';
  end if;

  if exists (
    select 1
    from public.ninja_operation_batches batches
    where batches.id = any(array[first_batch, second_batch])
      and (
        batches.status <> 'unmatched'
        or batches.accounting_status <> 'blocked'
        or batches.daily_control_id is not null
        or batches.context_prop_count <> 0
      )
  ) then
    raise exception 'Baltazar batches changed before controlled repair';
  end if;

  if (
    select count(*)
    from public.identity_account_assignments assignments
    join public.accounts accounts on accounts.id = assignments.account_id
    join public.ninja_account_links links
      on links.account_id = accounts.id
      and links.closed_at is null
    where assignments.identity_id = alanis_id
      and assignments.unassigned_at is null
      and assignments.account_id = any(account_ids)
      and accounts.state <> 'closed'
      and links.external_account_name in (
        'LFF05098109210001', 'LFF05098109210002', 'LFF05098109210003',
        'LFF05098109210004', 'LFF05098109210005'
      )
  ) <> 5 then
    raise exception 'Expected five active Alanis Funded accounts';
  end if;

  perform set_config('request.jwt.claim.sub', baltazar_id::text, true);

  select assigned.daily_control_id into first_control
  from public.assign_nodal_manual_accounts_to_ninja_batch(
    first_batch, account_ids, false
  ) assigned;

  select assigned.daily_control_id into second_control
  from public.assign_nodal_manual_accounts_to_ninja_batch(
    second_batch, account_ids, false
  ) assigned;

  if first_control is null or second_control is null or first_control = second_control then
    raise exception 'Expected two independent reconciled controls';
  end if;

  if exists (
    select 1
    from public.ninja_operation_batches batches
    where batches.id = any(array[first_batch, second_batch])
      and (
        batches.accounting_status <> 'committed'
        or batches.daily_control_id is null
        or batches.accounting_blocking_reason is not null
      )
  ) then
    raise exception 'Baltazar reconciliation did not commit both batches';
  end if;

  if exists (
    select 1
    from public.ninja_operation_batches batches
    where batches.id = any(array[first_batch, second_batch])
      and (
        select count(*)
        from public.ninja_operation_batch_manual_accounts assignments
        where assignments.batch_id = batches.id
      ) <> 5
  ) then
    raise exception 'Baltazar reconciliation did not assign all Alanis accounts';
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    mauricio_id,
    'ninja_operation_batches',
    first_batch,
    'baltazar_alanis_preupdate_trades_reconciled',
    jsonb_build_object(
      'identity_id', alanis_id,
      'batch_ids', jsonb_build_array(first_batch, second_batch),
      'daily_control_ids', jsonb_build_array(first_control, second_control),
      'account_ids', to_jsonb(account_ids),
      'broker_results_cents', jsonb_build_array(-10574, -10074),
      'source', 'broker telemetry plus owner confirmation',
      'backup_schema', 'private_baltazar_alanis_repair_20261111'
    ),
    'Reconstrucción auditada de dos trades de Baltazar con Alanis previos a actualizar el conector.'
  );
end;
$repair$;

commit;
