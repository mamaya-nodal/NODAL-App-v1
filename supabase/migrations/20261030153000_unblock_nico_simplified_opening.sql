-- APP-242: un lote reconstruido después del borrón general no puede volver a
-- enlazar cuentas anteriores al corte ni bloquear el nuevo punto de partida.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '2min';

select pg_advisory_xact_lock(hashtextextended('nodal-nico-opening-unblock-20261030', 0));

do $$
declare
  target_user_id constant uuid := '07e71363-9aeb-424b-aa91-0b20c16361f6'::uuid;
  target_period_id constant uuid := 'a6693d43-ffba-471e-9321-dddddd0f73c0'::uuid;
  target_batch_id constant uuid := 'f533cbf2-579f-4e3f-854b-56123d5e7b03'::uuid;
  opening_cutoff timestamptz;
  target_batch public.ninja_operation_batches%rowtype;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'ninja_operation_batches'
      and events.entity_id = target_batch_id
      and events.action = 'preopening_batch_detached_from_stale_accounts'
  ) then
    if exists (
      select 1 from public.ninja_operation_batch_members members
      where members.batch_id = target_batch_id and members.role = 'prop'
    ) then raise exception 'NICO_STALE_REPAIR_AUDIT_MISMATCH'; end if;
    return;
  end if;

  if not exists (
    select 1
    from public.nodal_users users
    where users.id = target_user_id
      and users.display_name = 'Nicolas'
  ) then raise exception 'NICO_USER_PRECONDITION_FAILED'; end if;

  select coalesce(snapshots.updated_at, snapshots.created_at)
  into opening_cutoff
  from public.period_opening_snapshots snapshots
  where snapshots.period_id = target_period_id
    and snapshots.revision_number = 1;

  if opening_cutoff is null then raise exception 'NICO_OPENING_PRECONDITION_FAILED'; end if;

  select * into target_batch
  from public.ninja_operation_batches batches
  where batches.id = target_batch_id
  for update;

  if not found
    or target_batch.accounting_status = 'committed'
    or target_batch.daily_control_id is not null
    or target_batch.opened_at >= opening_cutoff
    or target_batch.operated_on >= opening_cutoff::date
  then raise exception 'NICO_STALE_BATCH_PRECONDITION_FAILED'; end if;

  if (select count(*) from public.ninja_operation_batch_members members
      where members.batch_id = target_batch_id and members.role = 'prop') <> 5
  then raise exception 'NICO_STALE_MEMBERS_PRECONDITION_FAILED'; end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
  ) values (
    'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid,
    'ninja_operation_batches', target_batch_id,
    'preopening_batch_detached_from_stale_accounts',
    jsonb_build_object(
      'batch', to_jsonb(target_batch),
      'members', (
        select coalesce(jsonb_agg(to_jsonb(members) order by members.session_id), '[]'::jsonb)
        from public.ninja_operation_batch_members members
        where members.batch_id = target_batch_id
      ),
      'opening_cutoff', opening_cutoff
    ),
    jsonb_build_object(
      'accounting_status', 'blocked',
      'accounting_period_id', null,
      'prop_members', 0,
      'preserved_as_audit_evidence', true
    ),
    'Operación del 15/10 anterior al reinicio del 24/10; se conserva como evidencia y deja de bloquear la apertura vigente'
  );

  delete from public.ninja_operation_batch_manual_accounts manual
  where manual.batch_id = target_batch_id;

  delete from public.ninja_operation_batch_members members
  where members.batch_id = target_batch_id
    and members.role = 'prop';

  update public.ninja_operation_batches batches
  set accounting_mode = 'shadow',
      accounting_status = 'blocked',
      accounting_blocking_reason = 'Operación anterior al punto de partida vigente; conservada sólo para auditoría.',
      accounting_period_id = null,
      accounting_company_id = null,
      accounting_phase = null,
      daily_control_id = null,
      updated_at = now()
  where batches.id = target_batch_id;

  if exists (
    select 1 from public.ninja_operation_batch_members members
    where members.batch_id = target_batch_id and members.role = 'prop'
  ) then raise exception 'NICO_STALE_MEMBERS_CLEANUP_FAILED'; end if;
end;
$$;

commit;
