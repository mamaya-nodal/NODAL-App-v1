-- Reinicio selectivo previo al ingreso inicial de alumnos.
--
-- REQUIERE CONFIRMACION EXPLICITA ANTES DE EJECUTARSE EN PRODUCCION.
-- Conserva auth.users, nodal_users, terminos, autorizaciones y auditoria.
-- Conserva por completo a Mauricio, Alfred y Sebastian.
-- Reinicia solo a Ivo, Julian y Martin y recrea su fundacion del periodo actual.
-- Los PDF historicos no se eliminan de Storage; las filas que los referencian
-- ya estan preservadas en private_prelaunch_20261004.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '5min';

select pg_advisory_xact_lock(hashtextextended('nodal-prelaunch-reset-20261004', 0));

create temp table reset_target_users (
  user_id uuid primary key,
  email text not null unique,
  display_name text not null
) on commit drop;

insert into reset_target_users(user_id, email, display_name) values
  ('e70a9f26-86ce-42b6-b62c-827c63981254', 'ivosebastianpirrone@gmail.com', 'Ivo Pirrone'),
  ('0c90d147-a048-48c9-8f89-e095bbadc249', 'jas42200@gmail.com', 'Julian Agustin Seco'),
  ('bb5dc910-d6c2-42eb-9ab1-cd07898eeabc', 'martin.maina.trad@gmail.com', 'Martin Mainardi');

create temp table reset_preserved_users (
  user_id uuid primary key,
  label text not null
) on commit drop;

insert into reset_preserved_users(user_id, label) values
  ('79ec8c66-9eaf-497f-a646-3f0cafb2a3de', 'Mauricio - administracion'),
  ('f2f5f816-ec4f-46e1-b216-5267aeadc635', 'Mauricio - historial'),
  ('448eafd0-8158-401a-91fc-5819391b5f4e', 'Alfred'),
  ('ffabc050-c33c-47e5-8011-14404e5ee2d5', 'Sebastian');

create temp table reset_preserved_baseline on commit drop as
select
  preserved.user_id,
  (select count(*) from public.workspaces workspaces
    where workspaces.owner_user_id = preserved.user_id) as workspaces,
  (select count(*) from public.periods periods
    join public.workspaces workspaces on workspaces.id = periods.workspace_id
    where workspaces.owner_user_id = preserved.user_id) as periods,
  (select count(*) from public.accounts accounts
    join public.workspaces workspaces on workspaces.id = accounts.workspace_id
    where workspaces.owner_user_id = preserved.user_id) as accounts,
  (select count(*) from public.purchases purchases
    join public.periods periods on periods.id = purchases.period_id
    join public.workspaces workspaces on workspaces.id = periods.workspace_id
    where workspaces.owner_user_id = preserved.user_id) as purchases,
  (select count(*) from public.daily_controls controls
    join public.periods periods on periods.id = controls.period_id
    join public.workspaces workspaces on workspaces.id = periods.workspace_id
    where workspaces.owner_user_id = preserved.user_id) as daily_controls,
  (select count(*) from public.nodal_wallets wallets
    join public.workspaces workspaces on workspaces.id = wallets.workspace_id
    where workspaces.owner_user_id = preserved.user_id) as wallets,
  (select count(*) from public.ninja_connectors connectors
    where connectors.owner_user_id = preserved.user_id) as connectors
from reset_preserved_users preserved;

do $$
declare
  matched_targets integer;
begin
  if not exists (
    select 1
    from private_prelaunch_20261004.snapshot_metadata metadata
    where metadata.snapshot_key = 'prelaunch-20261004'
  ) or (
    select count(*) from private_prelaunch_20261004.table_manifest
  ) <> (
    select count(*) from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  ) or not coalesce((
    select bool_and(manifest.source_rows = manifest.copied_rows)
    from private_prelaunch_20261004.table_manifest manifest
  ), false) then
    raise exception 'PRELAUNCH_BACKUP_NOT_VERIFIED';
  end if;

  select count(*) into matched_targets
  from public.nodal_users users
  join reset_target_users targets on targets.user_id = users.id
  where users.email = targets.email
    and users.access_state = 'active'
    and users.access_role = 'student';

  if matched_targets <> 3 then
    raise exception 'TARGET_USER_PRECONDITION_FAILED: expected 3 active students, found %',
      matched_targets;
  end if;

  if not exists (
    select 1 from public.nodal_users users
    where users.id = '79ec8c66-9eaf-497f-a646-3f0cafb2a3de'
      and users.access_state = 'active'
      and users.access_role = 'admin'
  ) then
    raise exception 'RESET_ACTOR_ADMIN_NOT_AVAILABLE';
  end if;

  perform users.id
  from public.nodal_users users
  join reset_target_users targets on targets.user_id = users.id
  order by users.id
  for update;
end;
$$;

create temp table reset_workspaces on commit drop as
select workspaces.id
from public.workspaces workspaces
where workspaces.owner_user_id in (select user_id from reset_target_users);

create temp table reset_periods on commit drop as
select periods.id, periods.workspace_id, periods.period_month
from public.periods periods
where periods.workspace_id in (select id from reset_workspaces);

create temp table reset_connectors on commit drop as
select connectors.id
from public.ninja_connectors connectors
where connectors.owner_user_id in (select user_id from reset_target_users);

create temp table reset_wallets on commit drop as
select wallets.id
from public.nodal_wallets wallets
where wallets.workspace_id in (select id from reset_workspaces);

create temp table reset_accounts on commit drop as
select accounts.id
from public.accounts accounts
where accounts.workspace_id in (select id from reset_workspaces)
   or accounts.period_id in (select id from reset_periods)
   or accounts.opened_period_id in (select id from reset_periods);

create temp table reset_daily_controls on commit drop as
select controls.id
from public.daily_controls controls
where controls.period_id in (select id from reset_periods);

create temp table reset_before_counts (
  user_id uuid primary key,
  state jsonb not null
) on commit drop;

insert into reset_before_counts(user_id, state)
select targets.user_id, jsonb_build_object(
  'workspaces', (select count(*) from public.workspaces where owner_user_id = targets.user_id),
  'periods', (select count(*) from public.periods periods join public.workspaces workspaces on workspaces.id = periods.workspace_id where workspaces.owner_user_id = targets.user_id),
  'daily_controls', (select count(*) from public.daily_controls controls join public.periods periods on periods.id = controls.period_id join public.workspaces workspaces on workspaces.id = periods.workspace_id where workspaces.owner_user_id = targets.user_id),
  'wallets', (select count(*) from public.nodal_wallets wallets join public.workspaces workspaces on workspaces.id = wallets.workspace_id where workspaces.owner_user_id = targets.user_id),
  'connectors', (select count(*) from public.ninja_connectors connectors where connectors.owner_user_id = targets.user_id),
  'telemetry_events', (select count(*) from public.ninja_trade_telemetry_events telemetry join public.ninja_connectors connectors on connectors.id = telemetry.connector_id where connectors.owner_user_id = targets.user_id),
  'inventory_snapshots', (select count(*) from public.ninja_inventory_snapshots inventory join public.ninja_connectors connectors on connectors.id = inventory.connector_id where connectors.owner_user_id = targets.user_id)
)
from reset_target_users targets;

do $$
declare
  economic_rows bigint;
begin
  if (select count(*) from reset_workspaces) <> 6
    or (select count(*) from reset_periods) <> 12
    or (select count(*) from reset_wallets) <> 3
    or (select count(*) from reset_connectors) <> 7
    or (select count(*) from reset_daily_controls) <> 1 then
    raise exception 'RESET_PREVIEW_CHANGED: rerun the read-only impact report';
  end if;

  if exists (
    select 1 from reset_periods
    where period_month not in (date '2026-09-01', date '2026-10-01')
  ) then
    raise exception 'UNEXPECTED_TARGET_PERIOD';
  end if;

  select
    (select count(*) from public.accounts where id in (select id from reset_accounts))
    + (select count(*) from public.purchases where period_id in (select id from reset_periods))
    + (select count(*) from public.operation_entries where period_id in (select id from reset_periods))
    + (select count(*) from public.daily_control_participants where period_id in (select id from reset_periods))
    + (select count(*) from public.account_phase_withdrawals where period_id in (select id from reset_periods))
    + (select count(*) from public.funding_withdrawals where period_id in (select id from reset_periods))
    + (select count(*) from public.wallet_movements where period_id in (select id from reset_periods))
    + (select count(*) from public.manual_account_balance_observations where period_id in (select id from reset_periods))
  into economic_rows;

  if economic_rows <> 0 then
    raise exception 'UNEXPECTED_ECONOMIC_ROWS: expected 0, found %', economic_rows;
  end if;

  if exists (
    select 1 from public.ninja_connector_destinations destinations
    where (destinations.physical_connector_id in (select id from reset_connectors))
      <> (destinations.destination_connector_id in (select id from reset_connectors))
  ) or exists (
    select 1 from public.ninja_connector_route_epochs epochs
    where (epochs.physical_connector_id in (select id from reset_connectors))
      <> (epochs.destination_connector_id in (select id from reset_connectors))
  ) or exists (
    select 1 from public.ninja_account_ownership ownership
    where (ownership.physical_connector_id in (select id from reset_connectors))
      <> (ownership.destination_connector_id in (select id from reset_connectors))
  ) or exists (
    select 1 from public.ninja_inventory_snapshots inventory
    where (inventory.connector_id in (select id from reset_connectors))
      <> (inventory.physical_connector_id in (select id from reset_connectors))
  ) or exists (
    select 1 from public.ninja_operation_batches batches
    where batches.accounting_period_id in (select id from reset_periods)
      and batches.connector_id not in (select id from reset_connectors)
  ) or exists (
    select 1 from public.ninja_broker_balance_events events
    where events.daily_control_id in (select id from reset_daily_controls)
      and events.connector_id not in (select id from reset_connectors)
  ) then
    raise exception 'CROSS_OWNER_REFERENCE_DETECTED';
  end if;
end;
$$;

-- Relaciones restrictivas de conectores. El resto cae por CASCADE al retirar
-- los siete conectores de prueba.
delete from public.ninja_connector_connection_reviews
where connector_id in (select id from reset_connectors);

delete from public.ninja_account_ownership
where owner_user_id in (select user_id from reset_target_users)
   or physical_connector_id in (select id from reset_connectors)
   or destination_connector_id in (select id from reset_connectors);

delete from public.ninja_connector_route_epochs
where physical_connector_id in (select id from reset_connectors)
   or destination_connector_id in (select id from reset_connectors);

delete from public.ninja_connector_destinations
where physical_connector_id in (select id from reset_connectors)
   or destination_connector_id in (select id from reset_connectors);

delete from public.ninja_inventory_snapshots
where connector_id in (select id from reset_connectors)
   or physical_connector_id in (select id from reset_connectors);

delete from public.ninja_unclaimed_broker_accounts
where physical_connector_id in (select id from reset_connectors)
   or proposed_destination_connector_id in (select id from reset_connectors);

delete from public.ninja_pairing_codes
where owner_user_id in (select user_id from reset_target_users)
   or consumed_by_connector_id in (select id from reset_connectors);

delete from public.ninja_account_links
where connector_id in (select id from reset_connectors)
   or account_id in (select id from reset_accounts);

delete from public.ninja_connectors
where id in (select id from reset_connectors);

-- Cierres y aperturas de los periodos de prueba. Los objetos PDF de Storage
-- quedan intactos como evidencia fuera del circuito activo.
delete from public.period_closure_dispatches
where period_id in (select id from reset_periods);

delete from public.period_closure_approvals
where period_id in (select id from reset_periods);

delete from public.period_closure_observation_resolutions
where period_id in (select id from reset_periods);

delete from public.period_closure_reports
where period_id in (select id from reset_periods);

delete from public.period_rectifications
where source_period_id in (select id from reset_periods)
   or adjustment_period_id in (select id from reset_periods);

delete from public.period_closure_versions
where period_id in (select id from reset_periods);

delete from public.period_opening_account_batches
where opening_snapshot_id in (
  select id from public.period_opening_snapshots
  where period_id in (select id from reset_periods)
);

delete from public.period_opening_wallets
where opening_snapshot_id in (
  select id from public.period_opening_snapshots
  where period_id in (select id from reset_periods)
);

delete from public.period_opening_snapshots
where period_id in (select id from reset_periods);

delete from public.account_period_carryovers
where from_period_id in (select id from reset_periods)
   or to_period_id in (select id from reset_periods)
   or account_id in (select id from reset_accounts);

-- Fuentes automaticas e identidades de prueba.
delete from public.nodal_wallet_observations
where wallet_id in (select id from reset_wallets);

delete from public.nodal_wallet_sources
where workspace_id in (select id from reset_workspaces)
   or wallet_id in (select id from reset_wallets);

delete from public.identity_connector_installations
where workspace_id in (select id from reset_workspaces);

delete from public.identity_onboarding_requests
where workspace_id in (select id from reset_workspaces);

delete from public.identity_account_assignments
where workspace_id in (select id from reset_workspaces)
   or account_id in (select id from reset_accounts);

-- Se procesa primero el periodo mas nuevo de cada espacio. Asi se puede abrir
-- temporalmente el anterior y permitir que los triggers contables validen el
-- unico control diario de prueba antes de eliminarlo.
do $$
declare
  selected_period record;
begin
  for selected_period in
    select periods.id, periods.workspace_id, periods.period_month
    from public.periods periods
    where periods.id in (select id from reset_periods)
    order by periods.workspace_id, periods.period_month desc
  loop
    update public.periods
    set lifecycle_status = 'open',
        opened_at = coalesce(opened_at, now()),
        closed_at = null
    where id = selected_period.id;

    delete from public.ai_diagnostics
    where period_id = selected_period.id;

    delete from public.funding_withdrawals
    where period_id = selected_period.id;

    delete from public.wallet_movements
    where period_id = selected_period.id;

    delete from public.account_phase_withdrawals
    where period_id = selected_period.id;

    delete from public.operation_entries
    where period_id = selected_period.id;

    delete from public.daily_control_participants
    where period_id = selected_period.id;

    delete from public.daily_controls
    where period_id = selected_period.id;

    delete from public.manual_account_balance_observations
    where period_id = selected_period.id;

    delete from public.purchases
    where period_id = selected_period.id;

    delete from public.accounts
    where period_id = selected_period.id
       or opened_period_id = selected_period.id;

    delete from public.periods
    where id = selected_period.id;
  end loop;
end;
$$;

delete from public.nodal_wallets
where id in (select id from reset_wallets);

delete from public.nodal_identities
where workspace_id in (select id from reset_workspaces);

delete from public.workspaces
where id in (select id from reset_workspaces);

-- Recrea exactamente la misma base que obtiene un alumno nuevo: dos espacios
-- (real y practica) y un periodo contable actual en cada uno.
do $$
declare
  target record;
begin
  for target in select * from reset_target_users order by email loop
    perform public.provision_nodal_user_foundation(
      target.email,
      public.nodal_accounting_period_month(now()),
      'Reinicio selectivo previo al ingreso inicial de alumnos'
    );
  end loop;
end;
$$;

insert into public.audit_events(
  actor_user_id,
  entity_table,
  entity_id,
  action,
  previous_data,
  current_data,
  reason
)
select
  '79ec8c66-9eaf-497f-a646-3f0cafb2a3de'::uuid,
  'nodal_users',
  targets.user_id,
  'prelaunch_history_reset',
  before_counts.state,
  jsonb_build_object(
    'workspaces', (select count(*) from public.workspaces where owner_user_id = targets.user_id),
    'periods', (select count(*) from public.periods periods join public.workspaces workspaces on workspaces.id = periods.workspace_id where workspaces.owner_user_id = targets.user_id),
    'period_month', public.nodal_accounting_period_month(now()),
    'connectors', 0,
    'wallets', 0
  ),
  'Reinicio selectivo confirmado para el corte inicial; respaldo private_prelaunch_20261004'
from reset_target_users targets
join reset_before_counts before_counts on before_counts.user_id = targets.user_id;

do $$
declare
  preserved record;
begin
  if exists (
    select 1
    from reset_target_users targets
    where (select count(*) from public.workspaces where owner_user_id = targets.user_id) <> 2
       or (select count(*) from public.periods periods join public.workspaces workspaces on workspaces.id = periods.workspace_id where workspaces.owner_user_id = targets.user_id) <> 2
       or exists (
         select 1 from public.periods periods
         join public.workspaces workspaces on workspaces.id = periods.workspace_id
         where workspaces.owner_user_id = targets.user_id
           and periods.period_month <> public.nodal_accounting_period_month(now())
       )
       or exists (select 1 from public.ninja_connectors where owner_user_id = targets.user_id)
       or exists (select 1 from public.nodal_wallets wallets join public.workspaces workspaces on workspaces.id = wallets.workspace_id where workspaces.owner_user_id = targets.user_id)
       or exists (select 1 from public.daily_controls controls join public.periods periods on periods.id = controls.period_id join public.workspaces workspaces on workspaces.id = periods.workspace_id where workspaces.owner_user_id = targets.user_id)
  ) then
    raise exception 'TARGET_RESET_POSTCONDITION_FAILED';
  end if;

  for preserved in select * from reset_preserved_baseline loop
    if preserved.workspaces <> (select count(*) from public.workspaces where owner_user_id = preserved.user_id)
      or preserved.periods <> (select count(*) from public.periods periods join public.workspaces workspaces on workspaces.id = periods.workspace_id where workspaces.owner_user_id = preserved.user_id)
      or preserved.accounts <> (select count(*) from public.accounts accounts join public.workspaces workspaces on workspaces.id = accounts.workspace_id where workspaces.owner_user_id = preserved.user_id)
      or preserved.purchases <> (select count(*) from public.purchases purchases join public.periods periods on periods.id = purchases.period_id join public.workspaces workspaces on workspaces.id = periods.workspace_id where workspaces.owner_user_id = preserved.user_id)
      or preserved.daily_controls <> (select count(*) from public.daily_controls controls join public.periods periods on periods.id = controls.period_id join public.workspaces workspaces on workspaces.id = periods.workspace_id where workspaces.owner_user_id = preserved.user_id)
      or preserved.wallets <> (select count(*) from public.nodal_wallets wallets join public.workspaces workspaces on workspaces.id = wallets.workspace_id where workspaces.owner_user_id = preserved.user_id)
      or preserved.connectors <> (select count(*) from public.ninja_connectors where owner_user_id = preserved.user_id) then
      raise exception 'PRESERVED_HISTORY_CHANGED: %', preserved.user_id;
    end if;
  end loop;
end;
$$;

select
  targets.display_name,
  targets.email,
  before_counts.state as removed_state,
  (select count(*) from public.workspaces where owner_user_id = targets.user_id) as new_workspaces,
  (select count(*) from public.periods periods join public.workspaces workspaces on workspaces.id = periods.workspace_id where workspaces.owner_user_id = targets.user_id) as new_periods,
  (select count(*) from public.ninja_connectors where owner_user_id = targets.user_id) as connectors,
  (select count(*) from public.nodal_wallets wallets join public.workspaces workspaces on workspaces.id = wallets.workspace_id where workspaces.owner_user_id = targets.user_id) as wallets
from reset_target_users targets
join reset_before_counts before_counts on before_counts.user_id = targets.user_id
order by targets.display_name;

commit;
