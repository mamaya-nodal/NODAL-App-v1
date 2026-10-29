-- Una cuenta Funded no se cierra por obtener resultado positivo ni por alcanzar
-- la quinta vuelta. El cierre contable requiere una quema observada o una
-- decisión manual; mientras exista un vínculo Funded/Live activo, sigue viva.
--
-- Además corrige el punto operativo de las cinco Tradeify de Franco: fueron
-- registradas antes de operar el Día 1, por lo que tenían cero días completados.

begin;

create or replace function public.recalculate_nodal_account_state(target_account_id uuid)
returns public.account_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_period_id uuid;
  target_origin public.account_state_origin;
  target_created_by uuid;
  previous_state public.account_state;
  calculated_state public.account_state;
  has_active_link boolean := false;
  has_active_operational_link boolean := false;
  has_automatic_burn boolean := false;
  has_operational_data boolean := false;
begin
  select accounts.period_id, accounts.state_origin, accounts.created_by, accounts.state
  into target_period_id, target_origin, target_created_by, previous_state
  from public.accounts as accounts
  where accounts.id = target_account_id
  for update;
  if target_period_id is null then raise exception 'account does not exist'; end if;

  select
    exists (
      select 1
      from public.ninja_account_links links
      where links.account_id = target_account_id and links.closed_at is null
    ),
    exists (
      select 1
      from public.ninja_account_links links
      where links.account_id = target_account_id
        and links.closed_at is null
        and links.phase in ('Funded', 'Live')
    )
  into has_active_link, has_active_operational_link;

  select exists (
    select 1
    from public.ninja_account_links links
    where links.account_id = target_account_id
      and links.closure_reason = 'burned'
  ) and not has_active_link
  into has_automatic_burn;

  select
    exists (
      select 1 from public.operation_entries entries
      where entries.account_id = target_account_id
    )
    or exists (
      select 1 from public.account_phase_withdrawals withdrawals
      where withdrawals.account_id = target_account_id
    )
  into has_operational_data;

  calculated_state := case
    when target_origin = 'manual_live' then 'live'::public.account_state
    when target_origin = 'manual_closed' then 'closed'::public.account_state
    when has_active_operational_link then 'live'::public.account_state
    when has_automatic_burn then 'closed'::public.account_state
    when previous_state = 'closed' and not has_active_link then 'closed'::public.account_state
    when has_operational_data then 'live'::public.account_state
    else 'virgin'::public.account_state
  end;

  if previous_state is distinct from calculated_state then
    update public.accounts
    set state = calculated_state,
        updated_by = coalesce((select auth.uid()), target_created_by)
    where id = target_account_id;
  end if;

  return calculated_state;
end;
$$;

comment on function public.recalculate_nodal_account_state(uuid) is
  'Resuelve el estado contable sin cerrar una cuenta activa por resultado positivo o quinta vuelta.';

do $repair$
declare
  franco_id constant uuid := 'ca3dca6d-7ff2-4f92-957d-f3cb2c7553bf';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_connector_id constant uuid := '038a26a3-d9e8-44cf-91f9-ddc9054beff5';
  target_lucid_account_id constant uuid := 'dde41aaf-fde1-4f95-9ab3-d38ff8b4d172';
  changed_count integer;
  resolved_state public.account_state;
begin
  if exists (
    select 1 from public.audit_events events
    where events.entity_table = 'profiles'
      and events.entity_id = franco_id
      and events.action = 'franco_fifth_cycle_and_tradeify_progress_repaired'
  ) then
    return;
  end if;

  update public.ninja_account_links links
  set completed_trade_days = 0
  where links.connector_id = target_connector_id
    and links.closed_at is null
    and links.accounting_phase = 'Primera vuelta'
    and links.external_account_name in (
      'FTDFYSLX50433081206',
      'FTDFYSLX50148277918',
      'FTDFYSLX50413625023',
      'FTDFYSLX50871361650',
      'FTDFYSLX50845192487'
    );
  get diagnostics changed_count = row_count;
  if changed_count <> 5 then
    raise exception 'Expected five active Franco Tradeify links, found %', changed_count;
  end if;

  if not exists (
    select 1
    from public.ninja_account_links links
    where links.account_id = target_lucid_account_id
      and links.connector_id = target_connector_id
      and links.external_account_name = 'LFF05091986490004'
      and links.closed_at is null
      and links.phase = 'Funded'
  ) then
    raise exception 'Franco Lucid active Funded link is missing';
  end if;

  resolved_state := public.recalculate_nodal_account_state(target_lucid_account_id);
  if resolved_state <> 'live' then
    raise exception 'Franco Lucid must remain live, resolved %', resolved_state;
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    admin_id,
    'profiles',
    franco_id,
    'franco_fifth_cycle_and_tradeify_progress_repaired',
    jsonb_build_object(
      'lucid_account_id', target_lucid_account_id,
      'lucid_state', resolved_state,
      'lucid_external_account_name', 'LFF05091986490004',
      'tradeify_phase', 'Primera vuelta',
      'tradeify_completed_trade_days_at_registration', 0,
      'tradeify_committed_batches', 3,
      'tradeify_current_day', 4
    ),
    'Corrección solicitada por Mauricio: quinta vuelta no implica cierre y las cinco Tradeify avanzan por lotes económicos compartidos'
  );
end;
$repair$;

commit;
