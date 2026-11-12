-- Corrige dos conciliaciones ya confirmadas de Baltazar/Alanis.
-- El usuario confirmó que ambas operaciones se hicieron únicamente con
-- LFF05098109210001, no con el grupo completo de cinco cuentas.

begin;

create schema if not exists private_baltazar_alanis_001_repair_20261112;
revoke all on schema private_baltazar_alanis_001_repair_20261112
from public, anon, authenticated;

create table if not exists private_baltazar_alanis_001_repair_20261112.daily_controls as
select * from public.daily_controls
where id in (
  '12e0b3a0-200b-4117-86de-7fa1a1792167'::uuid,
  'ebe8afea-8d5a-4860-9c5c-afdf20b6d52b'::uuid
);

create table if not exists private_baltazar_alanis_001_repair_20261112.daily_control_participants as
select * from public.daily_control_participants
where daily_control_id in (
  '12e0b3a0-200b-4117-86de-7fa1a1792167'::uuid,
  'ebe8afea-8d5a-4860-9c5c-afdf20b6d52b'::uuid
);

create table if not exists private_baltazar_alanis_001_repair_20261112.operation_entries as
select * from public.operation_entries
where daily_control_id in (
  '12e0b3a0-200b-4117-86de-7fa1a1792167'::uuid,
  'ebe8afea-8d5a-4860-9c5c-afdf20b6d52b'::uuid
);

create table if not exists private_baltazar_alanis_001_repair_20261112.manual_accounts as
select * from public.ninja_operation_batch_manual_accounts
where batch_id in (
  '8faac2a9-4282-4462-a65a-894fe15a9728'::uuid,
  '0c06c232-b4de-450e-bfe9-883f34be03ac'::uuid
);

create table if not exists private_baltazar_alanis_001_repair_20261112.batches as
select * from public.ninja_operation_batches
where id in (
  '8faac2a9-4282-4462-a65a-894fe15a9728'::uuid,
  '0c06c232-b4de-450e-bfe9-883f34be03ac'::uuid
);

do $repair$
declare
  baltazar_id constant uuid := '42c42ea2-c9a9-41c6-8604-5804982c1f50';
  mauricio_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_account constant uuid := '56581f5d-2e22-422f-acbf-74e5020eb118';
  first_batch constant uuid := '8faac2a9-4282-4462-a65a-894fe15a9728';
  second_batch constant uuid := '0c06c232-b4de-450e-bfe9-883f34be03ac';
  first_control constant uuid := '12e0b3a0-200b-4117-86de-7fa1a1792167';
  second_control constant uuid := 'ebe8afea-8d5a-4860-9c5c-afdf20b6d52b';
begin
  if exists (
    select 1 from public.audit_events
    where entity_table = 'ninja_operation_batches'
      and entity_id = first_batch
      and action = 'baltazar_alanis_trades_reassigned_to_001'
  ) then
    return;
  end if;

  if not exists (
    select 1
    from public.ninja_account_links links
    join public.accounts accounts on accounts.id = links.account_id
    join public.periods periods on periods.id = accounts.period_id
    join public.workspaces workspaces on workspaces.id = periods.workspace_id
    where links.account_id = target_account
      and links.external_account_name = 'LFF05098109210001'
      and workspaces.owner_user_id = baltazar_id
  ) then
    raise exception 'Target Alanis account 001 is not owned by Baltazar';
  end if;

  if (
    select count(*)
    from public.ninja_operation_batches batches
    where (batches.id = first_batch
      and batches.daily_control_id = first_control
      and batches.broker_result_cents = -10574
      and batches.accounting_status = 'committed')
       or (batches.id = second_batch
      and batches.daily_control_id = second_control
      and batches.broker_result_cents = -10074
      and batches.accounting_status = 'committed')
  ) <> 2 then
    raise exception 'Expected the two committed Baltazar batches';
  end if;

  if exists (
    select 1
    from (values (first_control, -10574::bigint), (second_control, -10074::bigint))
      expected(control_id, result_cents)
    left join public.daily_controls controls on controls.id = expected.control_id
    where controls.operating_result_cents is distinct from expected.result_cents
      or controls.created_by is distinct from baltazar_id
  ) then
    raise exception 'Daily controls changed before reassignment';
  end if;

  delete from public.operation_entries entries
  where entries.daily_control_id in (first_control, second_control)
    and entries.account_id <> target_account;

  update public.operation_entries entries
  set magnitude_cents = case entries.daily_control_id
        when first_control then 10574
        when second_control then 10074
      end,
      participant_role = 'leader',
      destination = 'NETO BROKER -',
      updated_by = mauricio_id,
      updated_at = now()
  where entries.daily_control_id in (first_control, second_control)
    and entries.account_id = target_account;

  delete from public.daily_control_participants participants
  where participants.daily_control_id in (first_control, second_control)
    and participants.account_id <> target_account;

  update public.daily_control_participants participants
  set allocated_result_cents = case participants.daily_control_id
        when first_control then -10574
        when second_control then -10074
      end,
      role = 'leader'
  where participants.daily_control_id in (first_control, second_control)
    and participants.account_id = target_account;

  delete from public.ninja_operation_batch_manual_accounts assignments
  where assignments.batch_id in (first_batch, second_batch)
    and assignments.account_id <> target_account;

  update public.ninja_operation_batch_manual_accounts assignments
  set allocated_broker_result_cents = case assignments.batch_id
        when first_batch then -10574
        when second_batch then -10074
      end
  where assignments.batch_id in (first_batch, second_batch)
    and assignments.account_id = target_account;

  update public.ninja_operation_batches batches
  set distributed_cents = batches.broker_result_cents,
      rounding_difference_cents = 0,
      updated_at = now()
  where batches.id in (first_batch, second_batch);

  update public.daily_controls controls
  set leader_account_id = target_account,
      allocation_reason = 'Corrección solicitada por el usuario: la operación perteneció únicamente a LFF05098109210001.',
      observations = 'Cobertura Ninja corregida y asignada únicamente a LFF05098109210001.',
      updated_by = mauricio_id,
      updated_at = now()
  where controls.id in (first_control, second_control);

  if exists (
    select 1 from (values
      (first_batch, first_control, -10574::bigint),
      (second_batch, second_control, -10074::bigint)
    ) expected(batch_id, control_id, result_cents)
    where (select count(*) from public.ninja_operation_batch_manual_accounts m
           where m.batch_id = expected.batch_id
             and m.account_id = target_account
             and m.allocated_broker_result_cents = expected.result_cents) <> 1
       or (select count(*) from public.daily_control_participants p
           where p.daily_control_id = expected.control_id
             and p.account_id = target_account
             and p.role = 'leader'
             and p.allocated_result_cents = expected.result_cents) <> 1
       or (select count(*) from public.operation_entries e
           where e.daily_control_id = expected.control_id
             and e.account_id = target_account
             and e.destination = 'NETO BROKER -'
             and e.magnitude_cents = abs(expected.result_cents)) <> 1
  ) then
    raise exception 'Single-account reconciliation invariant failed';
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    mauricio_id,
    'ninja_operation_batches',
    first_batch,
    'baltazar_alanis_trades_reassigned_to_001',
    jsonb_build_object(
      'user_id', baltazar_id,
      'account_id', target_account,
      'external_account_name', 'LFF05098109210001',
      'batch_ids', jsonb_build_array(first_batch, second_batch),
      'daily_control_ids', jsonb_build_array(first_control, second_control),
      'broker_results_cents', jsonb_build_array(-10574, -10074),
      'backup_schema', 'private_baltazar_alanis_001_repair_20261112'
    ),
    'Corrección solicitada por Baltazar: las dos operaciones del 11/11 pertenecieron únicamente a la cuenta Alanis terminada en 001.'
  );
end;
$repair$;

commit;
