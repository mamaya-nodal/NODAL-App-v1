-- Restauracion excepcional y acotada para Baltazar Almiron (baltss).
--
-- Objetivo:
--   1. retirar la solicitud de "Nuevo inicio" creada por el rollout del 24/10;
--   2. recuperar la apertura y la contabilidad que Baltazar ya habia confirmado;
--   3. conservar cuentas, conectores, identidades y telemetria posterior sin cambios;
--   4. dejar el saldo broker actual como dato vivo, sin absorber el deposito posterior
--      de USD 2.603 en la apertura ni inventar un movimiento contable.
--
-- Fuente recuperable:
--   private_simplified_reset_20261024

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(hashtextextended(
  'restore-baltazar-pre-simplified-reset-20261027', 0
));

do $$
declare
  target_user_id constant uuid := '42c42ea2-c9a9-41c6-8604-5804982c1f50';
  target_workspace_id constant uuid := '3df1646f-c34a-4096-b473-637ce01e6f5f';
  target_period_id constant uuid := 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb';
  target_snapshot_id constant uuid := 'a0f92b07-da3d-440c-a916-fa7aa6512e9f';
  rollout_request_id constant uuid := '1f5e5c29-2341-4a72-a994-4f528ab9c55d';
begin
  if to_regclass('private_simplified_reset_20261024.period_opening_snapshots') is null then
    raise exception 'BALTazar_restore_source_missing';
  end if;

  if to_regnamespace('private_baltazar_restore_20261027') is not null then
    raise exception 'BALTazar_restore_backup_already_exists';
  end if;

  if not exists (
    select 1
    from public.workspaces workspaces
    where workspaces.id = target_workspace_id
      and workspaces.owner_user_id = target_user_id
  ) then
    raise exception 'BALTazar_workspace_precondition_failed';
  end if;

  if not exists (
    select 1
    from public.periods periods
    where periods.id = target_period_id
      and periods.workspace_id = target_workspace_id
      and periods.lifecycle_status = 'open'
  ) then
    raise exception 'BALTazar_period_precondition_failed';
  end if;

  if not exists (
    select 1
    from public.period_opening_snapshots snapshots
    where snapshots.id = target_snapshot_id
      and snapshots.period_id = target_period_id
      and snapshots.start_mode = 'zero'
      and snapshots.broker_balance_cents = 0
      and snapshots.wallet_balance_cents = 0
      and snapshots.prior_realized_result_cents = 0
      and snapshots.revision_number = 1
  ) then
    raise exception 'BALTazar_current_opening_precondition_failed';
  end if;

  if not exists (
    select 1
    from public.period_opening_revision_requests requests
    where requests.id = rollout_request_id
      and requests.period_id = target_period_id
      and requests.opening_snapshot_id = target_snapshot_id
      and requests.status = 'approved'
      and requests.consumed_at is null
      and requests.review_reason = 'Despliegue general autorizado del inicio simplificado 2026-10-24'
  ) then
    raise exception 'BALTazar_rollout_request_precondition_failed';
  end if;

  if (select count(*) from private_simplified_reset_20261024.period_opening_snapshots snapshots
      where snapshots.id = target_snapshot_id and snapshots.period_id = target_period_id) <> 1
    or (select count(*) from private_simplified_reset_20261024.period_opening_wallets wallets
        where wallets.opening_snapshot_id = target_snapshot_id) <> 3
    or (select count(*) from private_simplified_reset_20261024.daily_controls controls
        where controls.period_id = target_period_id) <> 2
    or (select count(*) from private_simplified_reset_20261024.daily_control_participants participants
        where participants.period_id = target_period_id) <> 10
    or (select count(*) from private_simplified_reset_20261024.operation_entries entries
        where entries.period_id = target_period_id) <> 10
    or (select count(*) from private_simplified_reset_20261024.ninja_operation_batches batches
        where batches.accounting_period_id = target_period_id) <> 2
    or (select count(*) from private_simplified_reset_20261024.ninja_operation_batch_members members
        where members.batch_id in (
          select batches.id
          from private_simplified_reset_20261024.ninja_operation_batches batches
          where batches.accounting_period_id = target_period_id
        )) <> 12
    or (select count(*) from private_simplified_reset_20261024.ninja_broker_balance_events events
        where events.daily_control_id in (
          select controls.id
          from private_simplified_reset_20261024.daily_controls controls
          where controls.period_id = target_period_id
        )) <> 2 then
    raise exception 'BALTazar_backup_cardinality_failed';
  end if;

  if exists (select 1 from public.daily_controls where period_id = target_period_id)
    or exists (select 1 from public.daily_control_participants where period_id = target_period_id)
    or exists (select 1 from public.operation_entries where period_id = target_period_id)
    or (select count(*) from public.ninja_operation_batches batches
        where batches.accounting_period_id = target_period_id) <> 2
    or exists (
      select 1
      from public.ninja_operation_batches batches
      where batches.accounting_period_id = target_period_id
        and not (
          batches.id in (
            '2d141efc-ff98-4ff6-9cbf-94a3e64f3539'::uuid,
            '813c1640-f544-48ad-9250-25b0807840a8'::uuid
          )
          and batches.accounting_mode = 'shadow'
          and batches.daily_control_id is null
          and batches.broker_session_id in (2351705, 2378925)
        )
    ) then
    raise exception 'BALTazar_post_reset_activity_detected';
  end if;
end;
$$;

-- Copia privada del estado inmediatamente anterior a esta restauracion.
create schema private_baltazar_restore_20261027;
revoke all on schema private_baltazar_restore_20261027 from public, anon, authenticated;

create table private_baltazar_restore_20261027.metadata as
select now() as captured_at,
  'restore-baltazar-pre-simplified-reset-20261027'::text as snapshot_key,
  '42c42ea2-c9a9-41c6-8604-5804982c1f50'::uuid as user_id,
  '3df1646f-c34a-4096-b473-637ce01e6f5f'::uuid as workspace_id,
  'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid as period_id;

create table private_baltazar_restore_20261027.period_opening_snapshots as
select * from public.period_opening_snapshots
where id = 'a0f92b07-da3d-440c-a916-fa7aa6512e9f'::uuid;

create table private_baltazar_restore_20261027.period_opening_revision_requests as
select * from public.period_opening_revision_requests
where period_id = 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid;

create table private_baltazar_restore_20261027.period_opening_wallets as
select * from public.period_opening_wallets
where opening_snapshot_id = 'a0f92b07-da3d-440c-a916-fa7aa6512e9f'::uuid;

create table private_baltazar_restore_20261027.nodal_wallets as
select * from public.nodal_wallets
where workspace_id = '3df1646f-c34a-4096-b473-637ce01e6f5f'::uuid;

create table private_baltazar_restore_20261027.daily_controls as
select * from public.daily_controls
where period_id = 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid;

create table private_baltazar_restore_20261027.daily_control_participants as
select * from public.daily_control_participants
where period_id = 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid;

create table private_baltazar_restore_20261027.operation_entries as
select * from public.operation_entries
where period_id = 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid;

create table private_baltazar_restore_20261027.ninja_operation_batches as
select * from public.ninja_operation_batches
where accounting_period_id = 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid;

create table private_baltazar_restore_20261027.ninja_operation_batch_members as
select members.*
from public.ninja_operation_batch_members members
where members.batch_id in (
  select batches.id from public.ninja_operation_batches batches
  where batches.accounting_period_id = 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid
);

create table private_baltazar_restore_20261027.ninja_broker_balance_events as
select events.*
from public.ninja_broker_balance_events events
where events.daily_control_id in (
  select controls.id from public.daily_controls controls
  where controls.period_id = 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid
);

-- Se elimina unicamente la autorizacion artificial que provoca "Nuevo inicio".
delete from public.period_opening_revision_requests
where id = '1f5e5c29-2341-4a72-a994-4f528ab9c55d'::uuid;

-- Se recuperan las billeteras originales, sin tocar movimientos posteriores.
insert into public.nodal_wallets(
  id, name, is_active, created_at, created_by, updated_at, updated_by, workspace_id
)
select id, name, is_active, created_at, created_by, updated_at, updated_by, workspace_id
from private_simplified_reset_20261024.nodal_wallets
where workspace_id = '3df1646f-c34a-4096-b473-637ce01e6f5f'::uuid
on conflict (id) do update set
  name = excluded.name,
  is_active = excluded.is_active,
  created_at = excluded.created_at,
  created_by = excluded.created_by,
  updated_at = excluded.updated_at,
  updated_by = excluded.updated_by,
  workspace_id = excluded.workspace_id;

update public.period_opening_snapshots current_snapshot
set start_mode = backup.start_mode,
    cutover_date = backup.cutover_date,
    broker_balance_cents = backup.broker_balance_cents,
    wallet_balance_cents = backup.wallet_balance_cents,
    funding_pending_cents = backup.funding_pending_cents,
    contributed_capital_cents = backup.contributed_capital_cents,
    personal_withdrawals_cents = backup.personal_withdrawals_cents,
    prior_realized_result_cents = backup.prior_realized_result_cents,
    floating_cents = backup.floating_cents,
    virgin_accounts = backup.virgin_accounts,
    live_evaluation_accounts = backup.live_evaluation_accounts,
    funded_accounts = backup.funded_accounts,
    closed_accounts_reference = backup.closed_accounts_reference,
    revision_number = backup.revision_number,
    updated_by = backup.updated_by,
    updated_at = backup.updated_at
from private_simplified_reset_20261024.period_opening_snapshots backup
where current_snapshot.id = backup.id
  and current_snapshot.id = 'a0f92b07-da3d-440c-a916-fa7aa6512e9f'::uuid;

delete from public.period_opening_wallets
where opening_snapshot_id = 'a0f92b07-da3d-440c-a916-fa7aa6512e9f'::uuid;

insert into public.period_opening_wallets
select * from private_simplified_reset_20261024.period_opening_wallets
where opening_snapshot_id = 'a0f92b07-da3d-440c-a916-fa7aa6512e9f'::uuid;

-- Se recupera la secuencia economica anterior, conservando las cuentas actuales.
-- Los dos lotes shadow son reproducciones tecnicas posteriores del mismo par
-- de sesiones ya confirmado antes del borrón. Se respaldaron arriba y se
-- reemplazan por sus lotes originales committed, evitando duplicar sesiones.
delete from public.ninja_operation_batches
where id in (
  '2d141efc-ff98-4ff6-9cbf-94a3e64f3539'::uuid,
  '813c1640-f544-48ad-9250-25b0807840a8'::uuid
);

insert into public.daily_controls
select * from private_simplified_reset_20261024.daily_controls
where period_id = 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid
on conflict do nothing;

insert into public.daily_control_participants
select * from private_simplified_reset_20261024.daily_control_participants
where period_id = 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid
on conflict do nothing;

insert into public.operation_entries
select * from private_simplified_reset_20261024.operation_entries
where period_id = 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid
on conflict do nothing;

insert into public.ninja_operation_batches
select * from private_simplified_reset_20261024.ninja_operation_batches
where accounting_period_id = 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid
on conflict do nothing;

insert into public.ninja_operation_batch_members
select members.*
from private_simplified_reset_20261024.ninja_operation_batch_members members
where members.batch_id in (
  select batches.id
  from private_simplified_reset_20261024.ninja_operation_batches batches
  where batches.accounting_period_id = 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid
)
on conflict do nothing;

-- La reproduccion posterior creo los mismos eventos de saldo con nuevos IDs y
-- estado pending. Se conserva ese registro actual y se le devuelve la
-- conciliacion confirmada original por su clave externa estable.
update public.ninja_broker_balance_events current_event
set status = backup_event.status,
    daily_control_id = backup_event.daily_control_id,
    resolved_at = backup_event.resolved_at
from private_simplified_reset_20261024.ninja_broker_balance_events backup_event
where current_event.connector_id = backup_event.connector_id
  and current_event.source_event_id = backup_event.source_event_id
  and backup_event.daily_control_id in (
    select controls.id
    from private_simplified_reset_20261024.daily_controls controls
    where controls.period_id = 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid
  );

insert into public.ninja_broker_balance_events
select events.*
from private_simplified_reset_20261024.ninja_broker_balance_events events
where events.daily_control_id in (
  select controls.id
  from private_simplified_reset_20261024.daily_controls controls
  where controls.period_id = 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb'::uuid
)
on conflict do nothing;

insert into public.audit_events(
  actor_user_id, entity_table, entity_id, action,
  previous_data, current_data, reason
)
values (
  'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid,
  'nodal_users',
  '42c42ea2-c9a9-41c6-8604-5804982c1f50'::uuid,
  'baltazar_pre_simplified_reset_restored',
  jsonb_build_object(
    'opening', (select to_jsonb(x) from private_baltazar_restore_20261027.period_opening_snapshots x),
    'revision_requests', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from private_baltazar_restore_20261027.period_opening_revision_requests x)
  ),
  jsonb_build_object(
    'source_schema', 'private_simplified_reset_20261024',
    'restore_backup_schema', 'private_baltazar_restore_20261027',
    'opening_broker_balance_cents', 543752,
    'latest_accounting_balance_cents', 403454,
    'restored_daily_controls', 2,
    'restored_operation_entries', 10
  ),
  'Restauracion excepcional solicitada: mantener el inicio anterior de Baltazar y retirar Nuevo inicio'
);

do $$
declare
  target_period_id constant uuid := 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb';
  target_snapshot_id constant uuid := 'a0f92b07-da3d-440c-a916-fa7aa6512e9f';
begin
  if exists (
    select 1 from public.period_opening_revision_requests
    where id = '1f5e5c29-2341-4a72-a994-4f528ab9c55d'::uuid
  ) then raise exception 'BALTazar_rollout_request_still_present'; end if;

  if not exists (
    select 1 from public.period_opening_snapshots
    where id = target_snapshot_id
      and period_id = target_period_id
      and start_mode = 'reconstruct'
      and cutover_date = '2026-10-22'::date
      and broker_balance_cents = 543752
      and wallet_balance_cents = 32140
      and prior_realized_result_cents = 575892
      and floating_cents = 53574
      and live_evaluation_accounts = 5
      and revision_number = 1
  ) then raise exception 'BALTazar_opening_restore_failed'; end if;

  if (select count(*) from public.period_opening_wallets where opening_snapshot_id = target_snapshot_id) <> 3
    or (select count(*) from public.daily_controls where period_id = target_period_id) <> 2
    or (select count(*) from public.daily_control_participants where period_id = target_period_id) <> 10
    or (select count(*) from public.operation_entries where period_id = target_period_id) <> 10
    or (select count(*) from public.ninja_operation_batches where accounting_period_id = target_period_id) <> 2
    or (select count(*) from public.ninja_operation_batch_members members where members.batch_id in (
      select batches.id from public.ninja_operation_batches batches
      where batches.accounting_period_id = target_period_id
    )) <> 12
    or (select count(*) from public.ninja_broker_balance_events events where events.daily_control_id in (
      select controls.id from public.daily_controls controls
      where controls.period_id = target_period_id
    )) <> 2 then
    raise exception 'BALTazar_economic_history_restore_failed';
  end if;

  if (select balance_after_cents from public.daily_controls
      where period_id = target_period_id
      order by control_number desc limit 1) <> 403454 then
    raise exception 'BALTazar_latest_accounting_balance_failed';
  end if;
end;
$$;

comment on schema private_baltazar_restore_20261027 is
  'Respaldo privado del estado de Baltazar inmediatamente antes de restaurar su inicio previo el 2026-10-27.';

commit;
