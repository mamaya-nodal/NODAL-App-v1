-- El precio de compra es el primer NETO BROKER - de Evaluación.
-- Se usa para estados automáticos sin crear una entrada duplicada de Control Diario.
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
  purchase_price_cents bigint := 0;
  phase_positive_cents bigint;
  phase_negative_cents bigint;
  phase_withdrawal_cents bigint;
  phase_total_gain_cents bigint;
  phase_name public.operation_phase;
  has_operational_data boolean;
  has_positive_total boolean := false;
begin
  select accounts.period_id, accounts.state_origin, accounts.created_by, accounts.state
  into target_period_id, target_origin, target_created_by, previous_state
  from public.accounts as accounts
  where accounts.id = target_account_id
  for update;

  if target_period_id is null then
    raise exception 'account does not exist';
  end if;

  select coalesce(purchases.price_cents, 0) into purchase_price_cents
  from public.purchases as purchases
  where purchases.account_id = target_account_id;

  if target_origin = 'manual_live' then
    calculated_state := 'live';
  elsif target_origin = 'manual_closed' then
    calculated_state := 'closed';
  else
    select exists (
      select 1 from public.operation_entries as entries
      where entries.account_id = target_account_id
    ) or exists (
      select 1 from public.account_phase_withdrawals as withdrawals
      where withdrawals.account_id = target_account_id
    ) into has_operational_data;

    for phase_name in
      select phases.phase::public.operation_phase
      from unnest(array[
        'Evaluacion', 'Primera vuelta', 'Segunda vuelta', 'Tercera vuelta',
        'Cuarta vuelta', 'Quinta vuelta'
      ]::text[]) with ordinality as phases(phase, ordinality)
    loop
      select
        coalesce(sum(entries.magnitude_cents) filter (where entries.destination = 'NETO BROKER +'), 0),
        coalesce(sum(entries.magnitude_cents) filter (where entries.destination = 'NETO BROKER -'), 0)
      into phase_positive_cents, phase_negative_cents
      from public.operation_entries as entries
      where entries.account_id = target_account_id and entries.phase = phase_name;

      if phase_name = 'Evaluacion' then
        phase_negative_cents := phase_negative_cents + purchase_price_cents;
        phase_withdrawal_cents := 0;
      else
        select coalesce(withdrawals.total_withdrawal_cents, 0)
        into phase_withdrawal_cents
        from public.account_phase_withdrawals as withdrawals
        where withdrawals.account_id = target_account_id and withdrawals.phase = phase_name;
        phase_withdrawal_cents := coalesce(phase_withdrawal_cents, 0);
      end if;

      phase_total_gain_cents := phase_positive_cents - phase_negative_cents + phase_withdrawal_cents;
      has_positive_total := has_positive_total or phase_total_gain_cents > 0;
    end loop;

    if has_positive_total then
      calculated_state := 'closed';
    elsif has_operational_data then
      calculated_state := 'live';
    else
      calculated_state := 'virgin';
    end if;
  end if;

  if previous_state is distinct from calculated_state then
    update public.accounts
    set state = calculated_state,
        updated_by = coalesce((select auth.uid()), target_created_by)
    where id = target_account_id;
  end if;

  return calculated_state;
end;
$$;

-- Corrige estados ya calculados con la versión anterior de la regla.
select public.recalculate_nodal_account_state(accounts.id)
from public.accounts as accounts;
