-- NODAL App: TOTAL GANANCIA por fase, TOTAL RETIRO manual y estado forzado.
-- Equivale al comportamiento vigente de Registro de Operaciones en Sheets.

create type public.account_state_origin as enum (
  'automatic',
  'manual_live',
  'manual_closed'
);

alter table public.accounts
add column state_origin public.account_state_origin not null default 'automatic';

create table public.account_phase_withdrawals (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods (id) on delete restrict,
  account_id uuid not null,
  phase public.operation_phase not null,
  total_withdrawal_cents bigint not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (account_id, phase),
  foreign key (account_id, period_id)
    references public.accounts (id, period_id) on delete restrict,
  constraint account_phase_withdrawals_only_for_turns check (phase <> 'Evaluacion'),
  constraint account_phase_withdrawals_nonnegative check (total_withdrawal_cents >= 0)
);

create index account_phase_withdrawals_period_account_idx
on public.account_phase_withdrawals (period_id, account_id, phase);

create trigger account_phase_withdrawals_set_updated_at
before update on public.account_phase_withdrawals
for each row execute function public.set_updated_at();

alter table public.account_phase_withdrawals enable row level security;

create policy account_phase_withdrawals_read_own
on public.account_phase_withdrawals for select to authenticated
using (public.can_access_period(period_id));

revoke all on table public.account_phase_withdrawals from anon;
revoke insert, update, delete on table public.account_phase_withdrawals from authenticated;
grant select on table public.account_phase_withdrawals to authenticated;

create function public.recalculate_nodal_account_state(target_account_id uuid)
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
  from public.accounts
  where accounts.id = target_account_id
  for update;

  if target_period_id is null then
    raise exception 'account does not exist';
  end if;

  if target_origin = 'manual_live' then
    calculated_state := 'live';
  elsif target_origin = 'manual_closed' then
    calculated_state := 'closed';
  else
    select exists (
      select 1
      from public.operation_entries as entries
      where entries.account_id = target_account_id
    ) or exists (
      select 1
      from public.account_phase_withdrawals as withdrawals
      where withdrawals.account_id = target_account_id
    )
    into has_operational_data;

    for phase_name in
      select phases.phase::public.operation_phase
      from unnest(array[
        'Evaluacion',
        'Primera vuelta',
        'Segunda vuelta',
        'Tercera vuelta',
        'Cuarta vuelta',
        'Quinta vuelta'
      ]::text[]) with ordinality as phases(phase, ordinality)
    loop
      select
        coalesce(sum(entries.magnitude_cents) filter (where entries.destination = 'NETO BROKER +'), 0),
        coalesce(sum(entries.magnitude_cents) filter (where entries.destination = 'NETO BROKER -'), 0)
      into phase_positive_cents, phase_negative_cents
      from public.operation_entries as entries
      where entries.account_id = target_account_id
        and entries.phase = phase_name;

      if phase_name = 'Evaluacion' then
        phase_withdrawal_cents := 0;
      else
        select coalesce(withdrawals.total_withdrawal_cents, 0)
        into phase_withdrawal_cents
        from public.account_phase_withdrawals as withdrawals
        where withdrawals.account_id = target_account_id
          and withdrawals.phase = phase_name;
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

create function public.recalculate_nodal_account_state_from_operation_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    perform public.recalculate_nodal_account_state(old.account_id);
    return old;
  end if;

  perform public.recalculate_nodal_account_state(new.account_id);
  return new;
end;
$$;

create trigger operation_entries_recalculate_account_state
after insert or update or delete on public.operation_entries
for each row execute function public.recalculate_nodal_account_state_from_operation_entry();

create function public.recalculate_nodal_account_state_from_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    perform public.recalculate_nodal_account_state(old.account_id);
    return old;
  end if;

  perform public.recalculate_nodal_account_state(new.account_id);
  return new;
end;
$$;

create trigger account_phase_withdrawals_recalculate_account_state
after insert or update or delete on public.account_phase_withdrawals
for each row execute function public.recalculate_nodal_account_state_from_withdrawal();

create function public.set_nodal_account_state_mode(
  target_period_id uuid,
  target_account_id uuid,
  target_state_origin public.account_state_origin
)
returns table (
  state public.account_state,
  state_origin public.account_state_origin
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  prior_state public.account_state;
  prior_origin public.account_state_origin;
  resolved_state public.account_state;
begin
  if actor_id is null then
    raise exception 'authenticated user required';
  end if;

  if not public.can_access_period(target_period_id) then
    raise exception 'selected period is not accessible';
  end if;

  select accounts.state, accounts.state_origin
  into prior_state, prior_origin
  from public.accounts as accounts
  where accounts.id = target_account_id
    and accounts.period_id = target_period_id
  for update;

  if prior_state is null then
    raise exception 'account does not belong to selected period';
  end if;

  update public.accounts
  set state_origin = target_state_origin,
      updated_by = actor_id
  where id = target_account_id;

  resolved_state := public.recalculate_nodal_account_state(target_account_id);

  insert into public.audit_events (
    actor_user_id,
    entity_table,
    entity_id,
    action,
    previous_data,
    current_data,
    reason
  ) values (
    actor_id,
    'accounts',
    target_account_id,
    'account_state_mode_set',
    jsonb_build_object('state', prior_state, 'state_origin', prior_origin),
    jsonb_build_object('state', resolved_state, 'state_origin', target_state_origin),
    case target_state_origin
      when 'automatic' then 'Estado automático restaurado'
      when 'manual_live' then 'Estado forzado a Cuenta viva'
      else 'Estado forzado a Cuenta cerrada'
    end
  );

  return query select resolved_state, target_state_origin;
end;
$$;

create function public.set_nodal_account_phase_withdrawal(
  target_period_id uuid,
  target_account_id uuid,
  target_phase public.operation_phase,
  target_total_withdrawal_cents bigint
)
returns table (
  total_withdrawal_cents bigint,
  state public.account_state
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  prior_withdrawal_cents bigint;
  withdrawal_id uuid;
  resolved_state public.account_state;
begin
  if actor_id is null then
    raise exception 'authenticated user required';
  end if;

  if target_phase = 'Evaluacion' then
    raise exception 'TOTAL RETIRO only exists in turns';
  end if;

  if target_total_withdrawal_cents < 0 then
    raise exception 'TOTAL RETIRO cannot be negative';
  end if;

  if not public.can_access_period(target_period_id) then
    raise exception 'selected period is not accessible';
  end if;

  if not exists (
    select 1 from public.accounts as accounts
    where accounts.id = target_account_id
      and accounts.period_id = target_period_id
  ) then
    raise exception 'account does not belong to selected period';
  end if;

  select withdrawals.total_withdrawal_cents
  into prior_withdrawal_cents
  from public.account_phase_withdrawals as withdrawals
  where withdrawals.account_id = target_account_id
    and withdrawals.phase = target_phase;

  insert into public.account_phase_withdrawals (
    period_id,
    account_id,
    phase,
    total_withdrawal_cents,
    created_by,
    updated_by
  ) values (
    target_period_id,
    target_account_id,
    target_phase,
    target_total_withdrawal_cents,
    actor_id,
    actor_id
  )
  on conflict (account_id, phase) do update
  set total_withdrawal_cents = excluded.total_withdrawal_cents,
      updated_by = excluded.updated_by
  returning id into withdrawal_id;

  resolved_state := public.recalculate_nodal_account_state(target_account_id);

  insert into public.audit_events (
    actor_user_id,
    entity_table,
    entity_id,
    action,
    previous_data,
    current_data,
    reason
  ) values (
    actor_id,
    'account_phase_withdrawals',
    withdrawal_id,
    case when prior_withdrawal_cents is null then 'account_phase_withdrawal_created'
      else 'account_phase_withdrawal_updated' end,
    case when prior_withdrawal_cents is null then null
      else jsonb_build_object('total_withdrawal_cents', prior_withdrawal_cents) end,
    jsonb_build_object(
      'account_id', target_account_id,
      'phase', target_phase,
      'total_withdrawal_cents', target_total_withdrawal_cents,
      'state', resolved_state
    ),
    'TOTAL RETIRO informado manualmente'
  );

  return query select target_total_withdrawal_cents, resolved_state;
end;
$$;

revoke all on function public.recalculate_nodal_account_state(uuid) from public, anon, authenticated;
revoke all on function public.recalculate_nodal_account_state_from_operation_entry() from public, anon, authenticated;
revoke all on function public.recalculate_nodal_account_state_from_withdrawal() from public, anon, authenticated;
revoke all on function public.set_nodal_account_state_mode(uuid, uuid, public.account_state_origin) from public, anon;
revoke all on function public.set_nodal_account_phase_withdrawal(uuid, uuid, public.operation_phase, bigint) from public, anon;
grant execute on function public.set_nodal_account_state_mode(uuid, uuid, public.account_state_origin) to authenticated;
grant execute on function public.set_nodal_account_phase_withdrawal(uuid, uuid, public.operation_phase, bigint) to authenticated;

-- Los registros ya existentes no disparan un trigger al crear esta migración.
-- Se recalculan una vez para que la vista y la base no queden desfasadas.
select public.recalculate_nodal_account_state(accounts.id)
from public.accounts as accounts;
