-- Un payout sólo corresponde a una cuenta contablemente viva y a una vuelta
-- Funded ya operada. La fila de cuenta se bloquea para impedir que dos altas
-- concurrentes creen más de un payout para la misma cuenta y vuelta.
create or replace function public.create_nodal_funding_withdrawal(
  target_period_id uuid,
  target_account_id uuid,
  target_approved_on date,
  target_amount_cents bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  new_id uuid;
  target_phase public.operation_phase;
  prior_phase_total bigint := 0;
begin
  if actor_id is null or not public.can_access_period(target_period_id) then
    raise exception 'selected period is not accessible';
  end if;
  if target_amount_cents is null or target_amount_cents <= 0
    or target_approved_on is null
    or not public.nodal_date_belongs_to_period(target_period_id, target_approved_on)
  then
    raise exception 'funding withdrawal is invalid for this period';
  end if;

  perform 1
  from public.accounts accounts
  where accounts.id = target_account_id
    and accounts.period_id = target_period_id
    and accounts.state = 'live'
  for update;
  if not found then raise exception 'FUNDING_ACCOUNT_NOT_ELIGIBLE'; end if;

  select entries.phase into target_phase
  from public.operation_entries entries
  where entries.account_id = target_account_id and entries.phase <> 'Evaluacion'
  order by array_position(
    array['Evaluacion','Primera vuelta','Segunda vuelta','Tercera vuelta','Cuarta vuelta','Quinta vuelta']::public.operation_phase[],
    entries.phase
  ) desc, entries.operated_on desc, entries.created_at desc
  limit 1;
  if target_phase is null then raise exception 'FUNDING_ACCOUNT_NOT_ELIGIBLE'; end if;

  if exists (
    select 1 from public.funding_withdrawals withdrawals
    where withdrawals.account_id = target_account_id
      and withdrawals.phase = target_phase
      and withdrawals.is_active
  ) then raise exception 'FUNDING_PAYOUT_ALREADY_RECORDED'; end if;

  insert into public.funding_withdrawals(
    period_id, account_id, approved_on, amount_cents, phase, created_by, updated_by
  ) values (
    target_period_id, target_account_id, target_approved_on,
    target_amount_cents, target_phase, actor_id, actor_id
  ) returning id into new_id;

  select coalesce(withdrawals.total_withdrawal_cents, 0) into prior_phase_total
  from public.account_phase_withdrawals withdrawals
  where withdrawals.account_id = target_account_id and withdrawals.phase = target_phase;
  prior_phase_total := coalesce(prior_phase_total, 0);

  insert into public.account_phase_withdrawals(
    period_id, account_id, phase, total_withdrawal_cents, created_by, updated_by
  ) values (
    target_period_id, target_account_id, target_phase,
    prior_phase_total + target_amount_cents, actor_id, actor_id
  )
  on conflict(account_id, phase) do update set
    total_withdrawal_cents = excluded.total_withdrawal_cents,
    updated_by = actor_id;

  perform public.recalculate_nodal_account_state(target_account_id);
  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id, 'funding_withdrawals', new_id, 'funding_withdrawal_approved',
    jsonb_build_object(
      'period_id', target_period_id,
      'account_id', target_account_id,
      'amount_cents', target_amount_cents,
      'approved_on', target_approved_on,
      'phase', target_phase,
      'phase_total_withdrawal_cents', prior_phase_total + target_amount_cents
    ),
    'Payout aprobado y aplicado atómicamente a TOTAL RETIRO'
  );
  return new_id;
end;
$$;

comment on function public.create_nodal_funding_withdrawal(uuid, uuid, date, bigint)
is 'Registra un único payout aprobado por cuenta y vuelta Funded para una cuenta contablemente viva.';
