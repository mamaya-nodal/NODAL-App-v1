-- Despliegue general del inicio simplificado confirmado el 2026-10-24.
--
-- Conserva usuarios, jerarquías, identidades, conectores, rutas e inventarios.
-- Preserva por completo a SB Digitalmarkets (Alfred).
-- Copia el estado retirado a un esquema privado antes de limpiar la contabilidad
-- vigente de los doce usuarios incluidos.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '5min';

select pg_advisory_xact_lock(hashtextextended('nodal-simplified-opening-rollout-20261024', 0));

create temp table reset_target_users (
  user_id uuid primary key,
  display_name text not null
) on commit drop;

insert into reset_target_users(user_id, display_name) values
  ('dea5c2b6-5eaa-4fca-862e-e0c754dcb29a', 'Alejandro Ivan Oyola Perez'),
  ('42c42ea2-c9a9-41c6-8604-5804982c1f50', 'Baltazar Almiron'),
  ('b1afb804-fb3f-4424-b9ab-5e0e0b0ec887', 'David Johel Zabaleta Mallqui'),
  ('e70a9f26-86ce-42b6-b62c-827c63981254', 'Ivo Pirrone'),
  ('b3a19ab3-4f07-4045-adea-66623af2a057', 'Javier Torales'),
  ('6173ce21-48bc-47a5-8a0a-10c6c44111e7', 'Juan Carlos Sanchez'),
  ('0c90d147-a048-48c9-8f89-e095bbadc249', 'Julian Agustin Seco'),
  ('718dd3b8-ccdf-4987-9716-dacb2c10a103', 'Leonardo Kenig'),
  ('2b0f63da-bf32-41ee-86c2-98fb5dbe583b', 'Lorena Mariel Malagreca'),
  ('f2f5f816-ec4f-46e1-b216-5267aeadc635', 'Mauricio Amaya'),
  ('07e71363-9aeb-424b-aa91-0b20c16361f6', 'Nicolas'),
  ('ffabc050-c33c-47e5-8011-14404e5ee2d5', 'Sebastian Bonincontro');

do $$
declare
  matched integer;
begin
  if exists (
    select 1 from reset_target_users
    where user_id = '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid
  ) then raise exception 'ALFRED_MUST_NOT_BE_A_RESET_TARGET'; end if;

  select count(*) into matched
  from public.nodal_users users
  join reset_target_users targets on targets.user_id = users.id
  where users.access_state = 'active';

  if matched <> 12 then
    raise exception 'RESET_TARGET_PRECONDITION_FAILED: expected 12 active users, found %', matched;
  end if;

  if not exists (
    select 1 from public.nodal_users
    where id = '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid
      and access_state = 'active'
  ) then raise exception 'ALFRED_PRESERVATION_TARGET_NOT_FOUND'; end if;

  perform users.id
  from public.nodal_users users
  join reset_target_users targets on targets.user_id = users.id
  order by users.id
  for update;
end;
$$;

create temp table reset_workspaces on commit drop as
select workspaces.id, workspaces.owner_user_id
from public.workspaces workspaces
where workspaces.modality = 'real'
  and workspaces.owner_user_id in (select user_id from reset_target_users);

create temp table reset_periods on commit drop as
select periods.id, periods.workspace_id, periods.period_month
from public.periods periods
where periods.workspace_id in (select id from reset_workspaces)
  and periods.lifecycle_status = 'open';

create temp table reset_accounts on commit drop as
select accounts.id
from public.accounts accounts
where accounts.period_id in (select id from reset_periods);

create temp table reset_controls on commit drop as
select controls.id
from public.daily_controls controls
where controls.period_id in (select id from reset_periods);

create temp table reset_wallets on commit drop as
select wallets.id
from public.nodal_wallets wallets
where wallets.workspace_id in (select id from reset_workspaces);

create temp table reset_snapshots on commit drop as
select snapshots.id
from public.period_opening_snapshots snapshots
where snapshots.period_id in (select id from reset_periods);

create temp table reset_batches on commit drop as
select distinct batches.id
from public.ninja_operation_batches batches
where batches.accounting_period_id in (select id from reset_periods)
   or batches.daily_control_id in (select id from reset_controls)
   or exists (
     select 1 from public.ninja_operation_batch_members members
     where members.batch_id = batches.id
       and members.account_id in (select id from reset_accounts)
   );

create temp table reset_preserved_baseline on commit drop as
select targets.user_id,
  (select count(*) from public.nodal_identities identities
    join public.workspaces workspaces on workspaces.id = identities.workspace_id
    where workspaces.owner_user_id = targets.user_id) as identities,
  (select count(*) from public.ninja_connectors connectors
    where connectors.owner_user_id = targets.user_id) as connectors
from reset_target_users targets;

create temp table alfred_baseline on commit drop as
select jsonb_build_object(
  'workspaces', (select count(*) from public.workspaces where owner_user_id = '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid),
  'periods', (select count(*) from public.periods periods join public.workspaces workspaces on workspaces.id = periods.workspace_id where workspaces.owner_user_id = '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid),
  'accounts', (select count(*) from public.accounts accounts join public.workspaces workspaces on workspaces.id = accounts.workspace_id where workspaces.owner_user_id = '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid),
  'identities', (select count(*) from public.nodal_identities identities join public.workspaces workspaces on workspaces.id = identities.workspace_id where workspaces.owner_user_id = '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid),
  'connectors', (select count(*) from public.ninja_connectors where owner_user_id = '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid),
  'daily_controls', (select count(*) from public.daily_controls controls join public.periods periods on periods.id = controls.period_id join public.workspaces workspaces on workspaces.id = periods.workspace_id where workspaces.owner_user_id = '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid)
) as state;

do $$
begin
  if (select count(*) from reset_workspaces) <> 12
    or (select count(*) from reset_periods) <> 12 then
    raise exception 'RESET_SCOPE_CHANGED: expected 12 real workspaces and 12 open periods';
  end if;

  if exists (
    select 1 from reset_periods
    where period_month <> public.nodal_accounting_period_month(now())
  ) then raise exception 'RESET_PERIOD_IS_NOT_CURRENT'; end if;

  if exists (
    select 1 from public.period_closure_versions
    where period_id in (select id from reset_periods)
  ) or exists (
    select 1 from public.period_rectifications
    where source_period_id in (select id from reset_periods)
       or adjustment_period_id in (select id from reset_periods)
  ) then raise exception 'RESET_PERIOD_ALREADY_CLOSED_OR_RECTIFIED'; end if;
end;
$$;

create schema if not exists private_simplified_reset_20261024;
revoke all on schema private_simplified_reset_20261024 from public, anon, authenticated;

do $$
begin
  if to_regclass('private_simplified_reset_20261024.snapshot_metadata') is not null then
    raise exception 'SIMPLIFIED_RESET_BACKUP_ALREADY_EXISTS';
  end if;
end;
$$;

create table private_simplified_reset_20261024.snapshot_metadata as
select now() as captured_at,
  'simplified-opening-rollout-20261024'::text as snapshot_key,
  12::integer as target_users,
  'SB Digitalmarkets / Alfred preserved'::text as exclusion;

create table private_simplified_reset_20261024.target_users as
select users.* from public.nodal_users users
where users.id in (select user_id from reset_target_users);

create table private_simplified_reset_20261024.workspaces as
select workspaces.* from public.workspaces workspaces
where workspaces.id in (select id from reset_workspaces);

create table private_simplified_reset_20261024.periods as
select periods.* from public.periods periods
where periods.id in (select id from reset_periods);

create table private_simplified_reset_20261024.period_opening_snapshots as
select snapshots.* from public.period_opening_snapshots snapshots
where snapshots.period_id in (select id from reset_periods);

create table private_simplified_reset_20261024.period_opening_account_batches as
select batches.* from public.period_opening_account_batches batches
where batches.opening_snapshot_id in (select id from reset_snapshots);

create table private_simplified_reset_20261024.period_opening_wallets as
select wallets.* from public.period_opening_wallets wallets
where wallets.opening_snapshot_id in (select id from reset_snapshots);

create table private_simplified_reset_20261024.period_opening_revision_requests as
select requests.* from public.period_opening_revision_requests requests
where requests.period_id in (select id from reset_periods);

create table private_simplified_reset_20261024.period_opening_revision_history as
select history.* from public.period_opening_revision_history history
where history.period_id in (select id from reset_periods);

create table private_simplified_reset_20261024.accounts as
select accounts.* from public.accounts accounts
where accounts.id in (select id from reset_accounts);

create table private_simplified_reset_20261024.purchases as
select purchases.* from public.purchases purchases
where purchases.period_id in (select id from reset_periods)
   or purchases.account_id in (select id from reset_accounts);

create table private_simplified_reset_20261024.identity_account_assignments as
select assignments.* from public.identity_account_assignments assignments
where assignments.account_id in (select id from reset_accounts);

create table private_simplified_reset_20261024.ninja_account_links as
select links.* from public.ninja_account_links links
where links.account_id in (select id from reset_accounts);

create table private_simplified_reset_20261024.ninja_account_registration_exclusions as
select exclusions.* from public.ninja_account_registration_exclusions exclusions
where exclusions.owner_user_id in (select user_id from reset_target_users);

create table private_simplified_reset_20261024.daily_controls as
select controls.* from public.daily_controls controls
where controls.id in (select id from reset_controls);

create table private_simplified_reset_20261024.daily_control_participants as
select participants.* from public.daily_control_participants participants
where participants.period_id in (select id from reset_periods);

create table private_simplified_reset_20261024.operation_entries as
select entries.* from public.operation_entries entries
where entries.period_id in (select id from reset_periods);

create table private_simplified_reset_20261024.account_phase_withdrawals as
select withdrawals.* from public.account_phase_withdrawals withdrawals
where withdrawals.period_id in (select id from reset_periods);

create table private_simplified_reset_20261024.funding_withdrawals as
select withdrawals.* from public.funding_withdrawals withdrawals
where withdrawals.period_id in (select id from reset_periods)
   or withdrawals.collected_period_id in (select id from reset_periods)
   or withdrawals.account_result_applied_period_id in (select id from reset_periods);

create table private_simplified_reset_20261024.wallet_movements as
select movements.* from public.wallet_movements movements
where movements.period_id in (select id from reset_periods);

create table private_simplified_reset_20261024.manual_account_balance_observations as
select observations.* from public.manual_account_balance_observations observations
where observations.period_id in (select id from reset_periods);

create table private_simplified_reset_20261024.account_period_carryovers as
select carryovers.* from public.account_period_carryovers carryovers
where carryovers.from_period_id in (select id from reset_periods)
   or carryovers.to_period_id in (select id from reset_periods)
   or carryovers.account_id in (select id from reset_accounts);

create table private_simplified_reset_20261024.ninja_operation_batches as
select batches.* from public.ninja_operation_batches batches
where batches.id in (select id from reset_batches);

create table private_simplified_reset_20261024.ninja_operation_batch_members as
select members.* from public.ninja_operation_batch_members members
where members.batch_id in (select id from reset_batches);

create table private_simplified_reset_20261024.ninja_operation_batch_manual_accounts as
select assignments.* from public.ninja_operation_batch_manual_accounts assignments
where assignments.batch_id in (select id from reset_batches);

create table private_simplified_reset_20261024.ninja_broker_balance_events as
select events.* from public.ninja_broker_balance_events events
where events.daily_control_id in (select id from reset_controls);

create table private_simplified_reset_20261024.ai_diagnostics as
select diagnostics.* from public.ai_diagnostics diagnostics
where diagnostics.period_id in (select id from reset_periods);

create table private_simplified_reset_20261024.nodal_wallets as
select wallets.* from public.nodal_wallets wallets
where wallets.id in (select id from reset_wallets);

create table private_simplified_reset_20261024.nodal_wallet_sources as
select sources.* from public.nodal_wallet_sources sources
where sources.workspace_id in (select id from reset_workspaces)
   or sources.wallet_id in (select id from reset_wallets);

create table private_simplified_reset_20261024.nodal_wallet_observations as
select observations.* from public.nodal_wallet_observations observations
where observations.wallet_id in (select id from reset_wallets);

-- Se retira únicamente la contabilidad vigente y su preparación anterior.
delete from public.period_opening_revision_history
where period_id in (select id from reset_periods);

delete from public.period_opening_revision_requests
where period_id in (select id from reset_periods);

delete from public.period_opening_account_batches
where opening_snapshot_id in (select id from reset_snapshots);

delete from public.period_opening_wallets
where opening_snapshot_id in (select id from reset_snapshots);

delete from public.ninja_account_registration_exclusions
where owner_user_id in (select user_id from reset_target_users);

delete from public.ninja_broker_balance_events
where daily_control_id in (select id from reset_controls);

delete from public.ninja_operation_batches
where id in (select id from reset_batches);

delete from public.account_period_carryovers
where from_period_id in (select id from reset_periods)
   or to_period_id in (select id from reset_periods)
   or account_id in (select id from reset_accounts);

delete from public.ai_diagnostics
where period_id in (select id from reset_periods);

delete from public.funding_withdrawals
where period_id in (select id from reset_periods)
   or collected_period_id in (select id from reset_periods)
   or account_result_applied_period_id in (select id from reset_periods);

delete from public.wallet_movements
where period_id in (select id from reset_periods);

delete from public.account_phase_withdrawals
where period_id in (select id from reset_periods);

delete from public.operation_entries
where period_id in (select id from reset_periods);

delete from public.daily_control_participants
where period_id in (select id from reset_periods);

delete from public.daily_controls
where id in (select id from reset_controls);

delete from public.manual_account_balance_observations
where period_id in (select id from reset_periods);

update public.purchases
set wallet_id = null, updated_at = now()
where (period_id in (select id from reset_periods)
    or account_id in (select id from reset_accounts))
  and wallet_id in (select id from reset_wallets);

delete from public.nodal_wallet_observations
where wallet_id in (select id from reset_wallets);

delete from public.nodal_wallet_sources
where workspace_id in (select id from reset_workspaces)
   or wallet_id in (select id from reset_wallets);

update public.nodal_wallets wallets
set name = left(wallets.name, 185) || ' · archivada 2026-10-24 · ' || left(wallets.id::text, 8),
    is_active = false,
    updated_by = 'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid,
    updated_at = now()
where wallets.id in (select id from reset_wallets);

-- Cada período queda con una apertura base vacía, revisión 1. La revisión 2
-- será creada por el propio usuario al confirmar su situación actual.
update public.period_opening_snapshots snapshots
set start_mode = 'zero',
    cutover_date = current_date,
    broker_balance_cents = 0,
    wallet_balance_cents = 0,
    funding_pending_cents = 0,
    contributed_capital_cents = 0,
    personal_withdrawals_cents = 0,
    prior_realized_result_cents = 0,
    floating_cents = 0,
    virgin_accounts = 0,
    live_evaluation_accounts = 0,
    funded_accounts = 0,
    closed_accounts_reference = 0,
    revision_number = 1,
    updated_by = 'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid,
    updated_at = now()
where snapshots.period_id in (select id from reset_periods);

insert into public.period_opening_snapshots(
  period_id, start_mode, cutover_date, broker_balance_cents,
  wallet_balance_cents, funding_pending_cents, contributed_capital_cents,
  personal_withdrawals_cents, prior_realized_result_cents, floating_cents,
  virgin_accounts, live_evaluation_accounts, funded_accounts,
  closed_accounts_reference, created_by, revision_number, updated_by
)
select periods.id, 'zero', current_date, 0,
  0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, workspaces.owner_user_id, 1,
  'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid
from reset_periods periods
join reset_workspaces workspaces on workspaces.id = periods.workspace_id
where not exists (
  select 1 from public.period_opening_snapshots snapshots
  where snapshots.period_id = periods.id
);

insert into public.period_opening_revision_requests(
  period_id, opening_snapshot_id, requested_by, status, requested_at,
  reviewed_by, reviewed_at, review_reason
)
select periods.id, snapshots.id, workspaces.owner_user_id, 'approved', now(),
  'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid, now(),
  'Despliegue general autorizado del inicio simplificado 2026-10-24'
from reset_periods periods
join reset_workspaces workspaces on workspaces.id = periods.workspace_id
join public.period_opening_snapshots snapshots on snapshots.period_id = periods.id;

insert into public.audit_events(
  actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
)
select
  'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid,
  'nodal_users', targets.user_id, 'simplified_opening_rollout_reset',
  jsonb_build_object(
    'backup_schema', 'private_simplified_reset_20261024',
    'period_id', periods.id,
    'accounts', (select count(*) from private_simplified_reset_20261024.accounts accounts where accounts.period_id = periods.id),
    'daily_controls', (select count(*) from private_simplified_reset_20261024.daily_controls controls where controls.period_id = periods.id),
    'operation_entries', (select count(*) from private_simplified_reset_20261024.operation_entries entries where entries.period_id = periods.id),
    'wallet_movements', (select count(*) from private_simplified_reset_20261024.wallet_movements movements where movements.period_id = periods.id)
  ),
  jsonb_build_object(
    'period_id', periods.id,
    'opening_revision', 1,
    'revision_request', 'approved',
    'identities_preserved', baseline.identities,
    'connectors_preserved', baseline.connectors
  ),
  'Borrón contable previo al nuevo inicio simplificado; Alfred excluido'
from reset_target_users targets
join reset_workspaces workspaces on workspaces.owner_user_id = targets.user_id
join reset_periods periods on periods.workspace_id = workspaces.id
join reset_preserved_baseline baseline on baseline.user_id = targets.user_id;

do $$
declare
  baseline record;
  alfred_after jsonb;
begin
  if exists (
    select 1 from reset_periods periods
    where public.nodal_period_opening_has_activity(periods.id)
       or (select count(*) from public.period_opening_snapshots snapshots where snapshots.period_id = periods.id and snapshots.revision_number = 1) <> 1
       or (select count(*) from public.period_opening_revision_requests requests where requests.period_id = periods.id and requests.status = 'approved') <> 1
  ) then raise exception 'TARGET_RESET_POSTCONDITION_FAILED'; end if;

  if exists (
    select 1 from public.nodal_wallets wallets
    where wallets.workspace_id in (select id from reset_workspaces)
      and wallets.is_active
  ) or exists (
    select 1 from public.ninja_account_registration_exclusions exclusions
    where exclusions.owner_user_id in (select user_id from reset_target_users)
  ) then raise exception 'STALE_WALLET_OR_ACCOUNT_EXCLUSION_AFTER_RESET'; end if;

  for baseline in select * from reset_preserved_baseline loop
    if baseline.identities <> (
      select count(*) from public.nodal_identities identities
      join public.workspaces workspaces on workspaces.id = identities.workspace_id
      where workspaces.owner_user_id = baseline.user_id
    ) or baseline.connectors <> (
      select count(*) from public.ninja_connectors connectors
      where connectors.owner_user_id = baseline.user_id
    ) then raise exception 'IDENTITY_OR_CONNECTOR_CHANGED_FOR_%', baseline.user_id; end if;
  end loop;

  select jsonb_build_object(
    'workspaces', (select count(*) from public.workspaces where owner_user_id = '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid),
    'periods', (select count(*) from public.periods periods join public.workspaces workspaces on workspaces.id = periods.workspace_id where workspaces.owner_user_id = '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid),
    'accounts', (select count(*) from public.accounts accounts join public.workspaces workspaces on workspaces.id = accounts.workspace_id where workspaces.owner_user_id = '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid),
    'identities', (select count(*) from public.nodal_identities identities join public.workspaces workspaces on workspaces.id = identities.workspace_id where workspaces.owner_user_id = '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid),
    'connectors', (select count(*) from public.ninja_connectors where owner_user_id = '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid),
    'daily_controls', (select count(*) from public.daily_controls controls join public.periods periods on periods.id = controls.period_id join public.workspaces workspaces on workspaces.id = periods.workspace_id where workspaces.owner_user_id = '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid)
  ) into alfred_after;

  if alfred_after <> (select state from alfred_baseline) then
    raise exception 'ALFRED_WAS_MODIFIED';
  end if;
end;
$$;

comment on schema private_simplified_reset_20261024 is
  'Respaldo privado recuperable del borrón contable autorizado el 2026-10-24; Alfred excluido.';

commit;
