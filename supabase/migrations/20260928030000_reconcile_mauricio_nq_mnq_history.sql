-- Reconstrucción puntual y auditable de la prueba de Mauricio del 25-28/09.
-- La Planilla NODAL permanece como fuente de referencia. No se borra telemetría:
-- los fragmentos técnicos duplicados se excluyen y se conservan para auditoría.

create or replace function public.get_current_user_ninja_operation_batches(target_limit integer default 30)
returns table (
  id uuid,
  opened_at timestamptz,
  settled_at timestamptz,
  correlation_status text,
  accounting_mode text,
  accounting_status text,
  blocking_reason text,
  operated_on date,
  broker_result_cents bigint,
  rounding_difference_cents bigint,
  company_name text,
  phase text,
  prop_accounts jsonb
)
language sql
security definer
set search_path = ''
stable
as $$
  select batches.id, batches.opened_at, batches.settled_at,
    batches.status, batches.accounting_mode, batches.accounting_status,
    batches.accounting_blocking_reason, batches.operated_on,
    batches.broker_result_cents, batches.rounding_difference_cents,
    companies.display_name, batches.accounting_phase::text,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'accountId', members.account_id,
        'accountName', members.account_name,
        'allocatedBrokerResultInCents', members.allocated_cents
      ) order by members.account_name)
      from (
        select technical.account_id, sessions.account_name,
          technical.allocated_broker_result_cents as allocated_cents
        from public.ninja_operation_batch_members technical
        join public.ninja_operation_probe_sessions sessions on sessions.id = technical.session_id
        where technical.batch_id = batches.id and technical.role = 'prop'
        union all
        select manual.account_id,
          company.display_name || ' · Cuenta ' || accounts.reference_number::text,
          manual.allocated_broker_result_cents
        from public.ninja_operation_batch_manual_accounts manual
        join public.accounts accounts on accounts.id = manual.account_id
        join public.companies company on company.id = accounts.company_id
        where manual.batch_id = batches.id
      ) members
    ), '[]'::jsonb)
  from public.ninja_operation_batches batches
  join public.ninja_connectors connectors on connectors.id = batches.connector_id
  join public.ninja_operation_probe_sessions broker_session
    on broker_session.id = batches.broker_session_id
  left join public.companies companies on companies.id = batches.accounting_company_id
  where connectors.owner_user_id = (select auth.uid())
    and connectors.status = 'active'
    and broker_session.excluded_at is null
  order by batches.opened_at desc, batches.id desc
  limit least(greatest(coalesce(target_limit, 30), 1), 100);
$$;

revoke all on function public.get_current_user_ninja_operation_batches(integer) from public, anon;
grant execute on function public.get_current_user_ninja_operation_batches(integer) to authenticated;

do $$
declare
  target_connector constant uuid := 'e721d96b-79b8-4504-9d7e-a15ca6651159';
  target_period constant uuid := '46deef83-7f88-4c90-9ef1-84a750166837';
  target_owner constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_company constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  account_1 constant uuid := 'f3850e81-7bb3-44c3-9019-6e55f1b600e9';
  account_2 constant uuid := '06dd7cbe-c42c-4058-a399-bbb02109e8d7';
  account_3 constant uuid := '03b926fc-e29c-4787-8700-39f7c80eba4c';
  account_4 constant uuid := '2ccb5007-397e-4018-ad1e-3bf991311854';
  account_5 constant uuid := 'e659349f-eaf3-4c77-867b-c2e3c1a2d540';
  account_6 constant uuid := '616e8955-507d-4514-ac41-e0d59a586547';
  account_7 constant uuid := 'ee6b6167-cbc8-4c38-a6c9-c82a28897ba3';
  batch_2 constant uuid := '75f9178c-a814-4851-8994-9fb30bc43e59';
  obsolete_batch_3 constant uuid := '797a9bf7-b63b-4dfb-bd59-a1cb1f7b933f';
  batch_3 constant uuid := 'e61c0895-86a3-4038-a918-9970872ecc8b';
  batch_4 constant uuid := '16c665ef-f899-4420-83f6-2f11aee3db80';
  batch_5 constant uuid := 'ae6baaa4-4522-43e5-a014-48125ff8fcfc';
  batch_6 constant uuid := 'f13cba60-616b-49c6-b7ea-f2ae2e2e7d31';
  batch_7 constant uuid := '887e3431-cc6c-4fe1-ab70-08a36bb07cc2';
  batch_8 constant uuid := '1e733a28-b871-4fb4-87e4-bf647a545a00';
  control_3 constant uuid := '533c8758-0bf5-4843-873b-a4b1bf338f76';
  control_4 constant uuid := '20e3e6d6-ed0c-42a6-ab1d-3609f82d5e6b';
  control_9 constant uuid := 'c176c489-fdd8-48d0-8457-911e86f6ea5f';
  control_5 uuid := gen_random_uuid();
  control_6 uuid := gen_random_uuid();
  control_7 uuid := gen_random_uuid();
  control_8 uuid := gen_random_uuid();
begin
  if exists (
    select 1 from public.audit_events
    where entity_table = 'ninja_connectors'
      and entity_id = target_connector
      and action = 'nq_mnq_history_reconciled_from_sheet'
  ) then
    return;
  end if;

  if (select count(*) from public.accounts where period_id = target_period) <> 7 then
    raise exception 'Mauricio history repair expected exactly seven accounts';
  end if;

  -- La numeración de la app se alinea con el sufijo técnico y la Planilla.
  update public.accounts
  set reference_number = reference_number + 100
  where id in (account_2, account_3, account_5);
  update public.accounts set reference_number = 2 where id = account_2;
  update public.accounts set reference_number = 3 where id = account_3;
  update public.accounts set reference_number = 5 where id = account_5;

  -- Corrige la cuenta adjudicada al segundo trade ya contabilizado.
  update public.daily_controls set leader_account_id = account_2, updated_at = now()
  where id = control_3;
  update public.daily_control_participants set account_id = account_2
  where daily_control_id = control_3;
  update public.operation_entries set account_id = account_2, updated_at = now()
  where daily_control_id = control_3;
  insert into public.ninja_operation_batch_members(
    batch_id, session_id, account_id, role, allocated_broker_result_cents
  ) values (batch_2, 96296, account_2, 'prop', 19386)
  on conflict (batch_id, session_id) do update
  set account_id = excluded.account_id,
    role = excluded.role,
    allocated_broker_result_cents = excluded.allocated_broker_result_cents;

  -- El tercer trade conserva la sesión real y excluye el fragmento duplicado.
  update public.ninja_operation_probe_sessions
  set excluded_at = now(), excluded_by = target_owner,
    exclusion_reason = 'Fragmento técnico duplicado por relectura parcial; reemplazado por la sesión 97658.'
  where id = 97067 and excluded_at is null;
  update public.ninja_operation_batches
  set accounting_mode = 'shadow', accounting_status = 'blocked', daily_control_id = null,
    accounting_blocking_reason = 'Sesión técnica duplicada excluida; reemplazada por el lote e61c0895.',
    updated_at = now()
  where id = obsolete_batch_3;
  update public.ninja_operation_batches
  set accounting_mode = 'active', accounting_status = 'committed', daily_control_id = control_4,
    accounting_blocking_reason = null, updated_at = now()
  where id = batch_3;
  update public.daily_controls
  set source_event_key = 'ninja-operation:226765', confirmation_key = batch_3,
    observations = 'Cierre reconstruido desde telemetría NinjaTrader y conciliado con la Planilla NODAL.',
    updated_at = now()
  where id = control_4;
  update public.ninja_broker_balance_events
  set status = 'superseded', daily_control_id = null, resolved_at = null
  where connector_id = target_connector and source_event_id = 'ninja-operation:226751';
  update public.ninja_broker_balance_events
  set status = 'confirmed', daily_control_id = control_4, resolved_at = now()
  where connector_id = target_connector and source_event_id = 'ninja-operation:226765';

  -- Excluye los otros dos fragmentos técnicos sin borrar su telemetría.
  update public.ninja_operation_probe_sessions
  set excluded_at = now(), excluded_by = target_owner,
    exclusion_reason = 'Fragmento técnico duplicado del cierre de la sesión 98240.'
  where id = 98859 and excluded_at is null;
  update public.ninja_operation_probe_sessions
  set excluded_at = now(), excluded_by = target_owner,
    exclusion_reason = 'Fragmento técnico duplicado del cierre de la sesión 99052.'
  where id = 100461 and excluded_at is null;
  update public.ninja_broker_balance_events
  set status = 'superseded', daily_control_id = null, resolved_at = null
  where connector_id = target_connector and source_event_id = 'ninja-operation:228184';

  -- Reserva el número 9 para el octavo trade que había sido confirmado antes de tiempo.
  update public.daily_controls
  set control_number = 9, balance_before_cents = 433126, balance_after_cents = 419062,
    received_balance_cents = 419062, operating_result_cents = -14064,
    sync_issue_reason = null,
    observations = 'Cierre reconstruido desde telemetría NinjaTrader y conciliado con la Planilla NODAL.',
    updated_at = now()
  where id = control_9;

  insert into public.daily_controls(
    id, period_id, control_number, operated_on, kind, balance_before_cents,
    balance_after_cents, operating_result_cents, company_id, leader_account_id,
    phase, observations, source, source_event_key, received_balance_cents,
    sync_issue_reason, confirmation_key, created_by, created_at, updated_at
  ) values
    (control_5, target_period, 5, '2026-09-28', 'balance_update', 415208,
      434594, 19386, target_company, account_4, 'Evaluacion',
      'Cierre reconstruido desde telemetría NinjaTrader y conciliado con la Planilla NODAL.',
      'ninjatrader', 'ninja-operation:227484', 434594, null, batch_4, target_owner,
      '2026-09-28T15:07:31+00:00', now()),
    (control_6, target_period, 6, '2026-09-28', 'balance_update', 434594,
      454280, 19686, target_company, account_5, 'Evaluacion',
      'Cierre reconstruido desde telemetría NinjaTrader y conciliado con la Planilla NODAL.',
      'ninjatrader', 'ninja-operation:228203', 454280, null, batch_5, target_owner,
      '2026-09-28T15:25:37+00:00', now()),
    (control_7, target_period, 7, '2026-09-28', 'balance_update', 454280,
      418090, -36190, target_company, account_1, 'Evaluacion',
      'Cierre reconstruido desde telemetría NinjaTrader y conciliado con la Planilla NODAL.',
      'ninjatrader', 'ninja-operation:229195', 418090, null, batch_6, target_owner,
      '2026-09-28T15:43:10+00:00', now()),
    (control_8, target_period, 8, '2026-09-28', 'balance_update', 418090,
      433126, 15036, target_company, account_6, 'Evaluacion',
      'Cierre reconstruido desde telemetría NinjaTrader y conciliado con la Planilla NODAL.',
      'ninjatrader', 'ninja-operation:230789', 433126, null, batch_7, target_owner,
      '2026-09-28T16:21:57+00:00', now());

  insert into public.daily_control_participants(
    daily_control_id, period_id, account_id, role, allocated_result_cents
  ) values
    (control_5, target_period, account_4, 'leader', 19386),
    (control_6, target_period, account_5, 'leader', 19686),
    (control_7, target_period, account_1, 'leader', -36190),
    (control_8, target_period, account_6, 'leader', 15036);

  insert into public.operation_entries(
    period_id, daily_control_id, account_id, operated_on, phase,
    participant_role, destination, magnitude_cents, created_by, created_at, updated_at
  ) values
    (target_period, control_5, account_4, '2026-09-28', 'Evaluacion',
      'leader', 'NETO BROKER +', 19386, target_owner, '2026-09-28T15:07:31+00:00', now()),
    (target_period, control_6, account_5, '2026-09-28', 'Evaluacion',
      'leader', 'NETO BROKER +', 19686, target_owner, '2026-09-28T15:25:37+00:00', now()),
    (target_period, control_7, account_1, '2026-09-28', 'Evaluacion',
      'leader', 'NETO BROKER -', 36190, target_owner, '2026-09-28T15:43:10+00:00', now()),
    (target_period, control_8, account_6, '2026-09-28', 'Evaluacion',
      'leader', 'NETO BROKER +', 15036, target_owner, '2026-09-28T16:21:57+00:00', now());

  update public.ninja_operation_batches
  set accounting_mode = 'active', accounting_status = 'committed',
    accounting_blocking_reason = null,
    daily_control_id = case id
      when batch_4 then control_5 when batch_5 then control_6
      when batch_6 then control_7 when batch_7 then control_8
    end,
    updated_at = now()
  where id in (batch_4, batch_5, batch_6, batch_7);

  update public.ninja_broker_balance_events events
  set status = 'confirmed',
    daily_control_id = case events.source_event_id
      when 'ninja-operation:227484' then control_5
      when 'ninja-operation:228203' then control_6
      when 'ninja-operation:229195' then control_7
      when 'ninja-operation:230789' then control_8
    end,
    resolved_at = now()
  where events.connector_id = target_connector
    and events.source_event_id in (
      'ninja-operation:227484', 'ninja-operation:228203',
      'ninja-operation:229195', 'ninja-operation:230789'
    );

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, previous_data, current_data, reason
  ) values (
    target_owner, 'ninja_connectors', target_connector,
    'nq_mnq_history_reconciled_from_sheet',
    jsonb_build_object(
      'existing_controls', 5,
      'excluded_duplicate_sessions', jsonb_build_array(97067, 98859, 100461)
    ),
    jsonb_build_object(
      'account_references', jsonb_build_array(1, 2, 3, 4, 5, 6, 7),
      'operation_balances_cents', jsonb_build_array(
        416336, 435722, 415208, 434594, 454280, 418090, 433126, 419062
      ),
      'operation_count', 8
    ),
    'Reconstrucción de la prueba NQ prop/MNQ broker contra la Planilla NODAL del usuario.'
  );
end;
$$;
