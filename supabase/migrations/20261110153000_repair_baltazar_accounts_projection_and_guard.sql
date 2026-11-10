-- Reconstructs the 10/11 Alanis operation and keeps the Accounts projection
-- coupled to every Nodalito reconciliation repair.

create or replace function public.nodalito_check_accounts_projection(target_plan uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_account uuid;
begin
  for changed_account in
    select distinct nullif(coalesce(changes.after_data, changes.before_data)->>'account_id', '')::uuid
    from public.nodalito_repair_changes changes
    where changes.plan_id = target_plan
      and changes.entity_table in ('accounts','ninja_account_links','daily_control_participants','operation_entries')
      and coalesce(changes.after_data, changes.before_data)->>'account_id' is not null
  loop
    if exists (
      select 1
      from public.daily_control_participants participants
      left join public.operation_entries entries
        on entries.daily_control_id = participants.daily_control_id
       and entries.account_id = participants.account_id
      where participants.account_id = changed_account
        and (entries.id is null
          or entries.phase is null
          or (case entries.destination
                when 'NETO BROKER +' then entries.magnitude_cents
                when 'NETO BROKER -' then -entries.magnitude_cents
                else 0
              end) <> participants.allocated_result_cents)
    ) then
      raise exception 'NODALITO_ACCOUNTS_LEDGER_INCOMPLETE';
    end if;

    if exists (select 1 from public.operation_entries where account_id = changed_account)
       and not exists (select 1 from public.purchases where account_id = changed_account) then
      raise exception 'NODALITO_ACCOUNTS_PURCHASE_MISSING';
    end if;

    if exists (select 1 from public.operation_entries where account_id = changed_account)
       and exists (select 1 from public.accounts where id = changed_account and state = 'virgin') then
      raise exception 'NODALITO_ACCOUNTS_STATE_STALE';
    end if;

    if exists (
      select 1
      from public.ninja_account_links links
      where links.account_id = changed_account
        and links.closed_at is null
        and (links.accounting_phase is null or links.completed_trade_days is null)
    ) then
      raise exception 'NODALITO_ACCOUNTS_PROGRESS_MISSING';
    end if;
  end loop;
end;
$$;

revoke all on function public.nodalito_check_accounts_projection(uuid)
from public, anon, authenticated;

create or replace function public.nodalito_check_repair(target_plan uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_id uuid;
  wallet_id uuid;
  c record;
  actual bigint;
  n integer;
begin
  select p.period_id into v_period_id
  from public.nodalito_repair_plans p where p.id = target_plan;

  for c in
    select d.* from public.daily_controls d
    where d.period_id = v_period_id and d.kind = 'balance_update'
      and exists (
        select 1 from public.nodalito_repair_changes j
        where j.plan_id = target_plan and (
          (j.entity_table = 'daily_controls' and j.row_key->>'id' = d.id::text)
          or (j.entity_table in ('operation_entries','daily_control_participants')
            and coalesce(j.after_data,j.before_data)->>'daily_control_id' = d.id::text)
        )
      )
  loop
    select count(*), sum(allocated_result_cents) into n, actual
    from public.daily_control_participants where daily_control_id = c.id;
    if n = 0
      or (c.allocation_reason is not null and actual <> c.operating_result_cents)
      or (c.allocation_reason is null and abs(actual - c.operating_result_cents) > ceil(n::numeric / 2)) then
      raise exception 'NODALITO_ALLOCATION_MISMATCH';
    end if;
    if exists (
      select 1 from public.daily_control_participants p
      left join public.operation_entries e
        on e.daily_control_id = p.daily_control_id and e.account_id = p.account_id
      where p.daily_control_id = c.id and (
        e.id is null or
        (case e.destination when 'NETO BROKER +' then e.magnitude_cents
          when 'NETO BROKER -' then -e.magnitude_cents else 0 end) <> p.allocated_result_cents
      )
    ) then raise exception 'NODALITO_LEDGER_MISMATCH'; end if;
  end loop;

  for wallet_id in
    select distinct nullif(coalesce(j.after_data,j.before_data)->>'wallet_id','')::uuid
    from public.nodalito_repair_changes j
    where j.plan_id = target_plan
      and coalesce(j.after_data,j.before_data)->>'wallet_id' is not null
  loop
    if public.calculate_nodal_wallet_balance(wallet_id) < 0 then
      raise exception 'NODALITO_WALLET_INSUFFICIENT';
    end if;
  end loop;

  perform public.nodalito_check_accounts_projection(target_plan);
end;
$$;

revoke all on function public.nodalito_check_repair(uuid)
from public, anon, authenticated;

do $$
declare
  owner_id constant uuid := '42c42ea2-c9a9-41c6-8604-5804982c1f50';
  target_period_id constant uuid := 'd4d9ef94-f0b9-495b-9961-e3c47c32ddeb';
  company_id constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  alanis_connector constant uuid := '6e20a588-0a54-4953-b6a3-36b899ff54a7';
  account_ids constant uuid[] := array[
    '56581f5d-2e22-422f-acbf-74e5020eb118',
    '1d454925-0dcb-45e3-85ad-a330b97cbd7c',
    'c4389bb6-6d08-40d2-aa1f-cbbf1cc92b95',
    '67480f02-00c7-4f94-b2f2-0a2af1eac14f',
    'bd4236f9-e152-4881-8a59-9fc307078557'
  ]::uuid[];
  burned_ids constant uuid[] := array[
    '07fc535b-1819-4c1b-8bc9-e6b903d729c5',
    'd3aa0a8b-bf47-4acb-a6fb-39276422b3fe',
    '632a3b74-e03f-481b-bf67-f97d74903811',
    '24307e3f-a149-4064-9058-d487faf8a946',
    '9b0405ca-cf6a-47fa-8ae6-08784870392b'
  ]::uuid[];
  control_id uuid;
  expected_control integer;
  plan record;
begin
  if (select count(*) from public.accounts where id = any(account_ids) and period_id = target_period_id) <> 5 then
    raise exception 'BALTazar_ALANIS_ACCOUNT_SCOPE_CHANGED';
  end if;
  if exists (select 1 from public.daily_controls where period_id = target_period_id and operated_on = '2026-11-10') then
    if (select count(*) from public.daily_controls
        where period_id = target_period_id and operated_on = '2026-11-10'
          and source_event_key in (
            'ninja-inventory:6c5eb2ac12c842d38acf7ea0d6e05029',
            'ninja-inventory:d6ce6499c4b3456ea4fa3aa7302124c8',
            'ninja-inventory:6627392f328d4c3d9639593b9ff177ef'
          )) <> 3 then
      raise exception 'BALTazar_2026_11_10_CONFLICT';
    end if;
    return;
  end if;
  select coalesce(max(control_number), 0) + 1 into expected_control
  from public.daily_controls where period_id = target_period_id;

  for plan in
    select * from (values
      (1, 248648::bigint, 228500::bigint, array[account_ids[1],account_ids[2]]::uuid[], 'ninja-inventory:6c5eb2ac12c842d38acf7ea0d6e05029'),
      (2, 228500::bigint, 203352::bigint, array[account_ids[3],account_ids[4]]::uuid[], 'ninja-inventory:d6ce6499c4b3456ea4fa3aa7302124c8'),
      (3, 203352::bigint, 191778::bigint, array[account_ids[5]]::uuid[], 'ninja-inventory:6627392f328d4c3d9639593b9ff177ef')
    ) p(offset_number,before_cents,after_cents,participants,source_key)
  loop
    insert into public.daily_controls(
      period_id, control_number, operated_on, kind, balance_before_cents,
      balance_after_cents, operating_result_cents, company_id, leader_account_id,
      phase, observations, source, source_event_key, received_balance_cents,
      confirmation_key, created_by
    ) values (
      target_period_id, expected_control + plan.offset_number - 1, '2026-11-10', 'balance_update',
      plan.before_cents, plan.after_cents, plan.after_cents - plan.before_cents,
      company_id, plan.participants[1], 'Primera vuelta',
      'Reconstrucción auditada desde inventarios consecutivos del conector Alanis; sin posiciones abiertas.',
      'ninjatrader', plan.source_key, plan.after_cents, gen_random_uuid(), owner_id
    ) returning id into control_id;

    insert into public.daily_control_participants(
      daily_control_id, period_id, account_id, role, allocated_result_cents
    )
    select control_id, target_period_id, participant,
      case when ordinality = 1 then 'leader'::public.daily_control_participant_role
        else 'replica'::public.daily_control_participant_role end,
      case
        when cardinality(plan.participants) = 1 then plan.after_cents - plan.before_cents
        else (plan.after_cents - plan.before_cents) / 2
      end
    from unnest(plan.participants) with ordinality x(participant, ordinality);

    insert into public.operation_entries(
      period_id, daily_control_id, account_id, operated_on, phase,
      participant_role, destination, magnitude_cents, created_by
    )
    select target_period_id, control_id, participants.account_id, '2026-11-10', 'Primera vuelta',
      participants.role, 'NETO BROKER -', abs(participants.allocated_result_cents), owner_id
    from public.daily_control_participants participants
    where participants.daily_control_id = control_id;
  end loop;

  update public.ninja_account_links
  set accounting_phase = 'Primera vuelta', completed_trade_days = 0
  where connector_id = alanis_connector and account_id = any(account_ids)
    and closed_at is null;

  update public.ninja_account_links
  set accounting_phase = 'Evaluacion', completed_trade_days = 0
  where connector_id = '054ac7da-bcc8-40e6-82ba-cf5200ec4ce5'
    and account_id in (
      '2ed5d7c7-f80d-47c2-afa8-cb843c081e9a','242e0f66-a007-48d7-8704-55bdfc6864f1',
      'e5268f49-e761-4434-8a3e-f15502ea0bca','4d486be5-1aa9-4688-89eb-f5e1abeb3159',
      '72de9754-a4df-4671-89f6-ced4e3e54228'
    ) and closed_at is null;

  update public.accounts
  set state = 'closed', updated_by = owner_id
  where id = any(burned_ids);
  update public.ninja_account_links
  set closed_at = coalesce(closed_at, '2026-11-02 13:20:00-03'::timestamptz),
      closure_reason = coalesce(closure_reason, 'Cierre auditado: cuentas Funded 6 a 10 quemadas')
  where account_id = any(burned_ids) and closed_at is null;

  if (select balance_after_cents from public.daily_controls where period_id = target_period_id order by control_number desc limit 1) <> 191778 then
    raise exception 'BALTazar_FINAL_BALANCE_MISMATCH';
  end if;
  if (select count(*) from public.operation_entries where operated_on = '2026-11-10' and account_id = any(account_ids)) <> 5 then
    raise exception 'BALTazar_TODAY_ACCOUNTS_INCOMPLETE';
  end if;
  if exists (select 1 from public.ninja_account_links where account_id = any(burned_ids) and closed_at is null) then
    raise exception 'BALTazar_BURNED_LINKS_STILL_ACTIVE';
  end if;

  insert into public.audit_events(actor_user_id, entity_table, action, current_data, reason)
  values (owner_id, 'daily_controls', 'repair_baltazar_2026_11_10_and_accounts_projection',
    jsonb_build_object(
      'controls_created', 3, 'accounts_operated', 5,
      'final_broker_balance_cents', 191778,
      'alanis_progress', 'Primera vuelta Día 4',
      'leandro_progress', 'Evaluación Día 1',
      'burned_personal_accounts_closed', 5,
      'accounts_projection_guard', true
    ),
    'Reconstrucción auditada y cierre del desacople entre conciliación y orejeta Cuentas');
end;
$$;
