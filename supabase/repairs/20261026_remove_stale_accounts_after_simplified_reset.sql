-- Completa el borrón general del 2026-10-24 para quienes todavía no
-- confirmaron su nuevo inicio. La reparación no toca identidades, conectores,
-- rutas ni inventarios actuales y conserva el respaldo privado original.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '5min';

select pg_advisory_xact_lock(hashtextextended('nodal-simplified-opening-stale-account-cleanup-20261026', 0));

create temp table cleanup_periods on commit drop as
select periods.id as period_id, workspaces.owner_user_id
from public.periods periods
join public.workspaces workspaces on workspaces.id = periods.workspace_id
join public.period_opening_snapshots snapshots on snapshots.period_id = periods.id
where workspaces.owner_user_id in (
  'dea5c2b6-5eaa-4fca-862e-e0c754dcb29a',
  '42c42ea2-c9a9-41c6-8604-5804982c1f50',
  'b1afb804-fb3f-4424-b9ab-5e0e0b0ec887',
  'e70a9f26-86ce-42b6-b62c-827c63981254',
  'b3a19ab3-4f07-4045-adea-66623af2a057',
  '6173ce21-48bc-47a5-8a0a-10c6c44111e7',
  '0c90d147-a048-48c9-8f89-e095bbadc249',
  '718dd3b8-ccdf-4987-9716-dacb2c10a103',
  '2b0f63da-bf32-41ee-86c2-98fb5dbe583b',
  'f2f5f816-ec4f-46e1-b216-5267aeadc635',
  '07e71363-9aeb-424b-aa91-0b20c16361f6',
  'ffabc050-c33c-47e5-8011-14404e5ee2d5'
)
  and workspaces.modality = 'real'
  and periods.lifecycle_status = 'open'
  and snapshots.revision_number = 1
  and not public.nodal_period_opening_has_activity(periods.id)
  and exists (
    select 1
    from public.period_opening_revision_requests requests
    where requests.period_id = periods.id
      and requests.status = 'approved'
      and requests.review_reason = 'Despliegue general autorizado del inicio simplificado 2026-10-24'
  );

do $$
begin
  if not exists (
    select 1 from cleanup_periods
    where owner_user_id = '2b0f63da-bf32-41ee-86c2-98fb5dbe583b'::uuid
  ) then raise exception 'LORENA_RESET_PRECONDITION_FAILED'; end if;

  if exists (
    select 1 from cleanup_periods
    where owner_user_id = '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid
  ) then raise exception 'ALFRED_MUST_NOT_BE_A_CLEANUP_TARGET'; end if;
end;
$$;

create temp table cleanup_accounts on commit drop as
select accounts.id, accounts.period_id
from public.accounts accounts
where accounts.period_id in (select period_id from cleanup_periods);

insert into public.audit_events(
  actor_user_id, entity_table, entity_id, action, previous_data, reason
)
select
  'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid,
  'accounts', accounts.id, 'simplified_opening_stale_account_removed',
  jsonb_build_object(
    'account', to_jsonb(accounts),
    'purchase', (
      select to_jsonb(purchases)
      from public.purchases purchases
      where purchases.account_id = accounts.id
    ),
    'ninja_links', coalesce((
      select jsonb_agg(to_jsonb(links) order by links.first_seen_at)
      from public.ninja_account_links links
      where links.account_id = accounts.id
    ), '[]'::jsonb),
    'identity_assignments', coalesce((
      select jsonb_agg(to_jsonb(assignments) order by assignments.assigned_at)
      from public.identity_account_assignments assignments
      where assignments.account_id = accounts.id
    ), '[]'::jsonb),
    'original_backup_schema', 'private_simplified_reset_20261024'
  ),
  'Residuo del registro anterior retirado antes del nuevo inicio simplificado'
from public.accounts accounts
join cleanup_accounts targets on targets.id = accounts.id;

delete from public.identity_account_assignments assignments
where assignments.account_id in (select id from cleanup_accounts);

delete from public.ninja_account_links links
where links.account_id in (select id from cleanup_accounts);

delete from public.purchases purchases
where purchases.account_id in (select id from cleanup_accounts);

delete from public.accounts accounts
where accounts.id in (select id from cleanup_accounts);

insert into public.audit_events(
  actor_user_id, entity_table, entity_id, action, current_data, reason
)
select
  'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid,
  'nodal_users', periods.owner_user_id, 'simplified_opening_stale_accounts_cleanup',
  jsonb_build_object(
    'period_id', periods.period_id,
    'removed_accounts', (
      select count(*) from cleanup_accounts accounts
      where accounts.period_id = periods.period_id
    ),
    'identities_preserved', true,
    'connectors_preserved', true,
    'inventories_preserved', true
  ),
  'Finalización del borrón contable anterior al nuevo inicio simplificado'
from cleanup_periods periods;

do $$
begin
  if exists (
    select 1 from public.accounts accounts
    where accounts.id in (select id from cleanup_accounts)
  ) then raise exception 'STALE_ACCOUNT_CLEANUP_FAILED'; end if;
end;
$$;

commit;
