-- Una apertura confirmada habilita el primer periodo real. Las billeteras se
-- pueden agregar durante todo el periodo abierto, no solo en la reconstruccion.

create or replace function public.open_nodal_period_after_opening_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_period public.periods%rowtype;
begin
  select periods.*
  into selected_period
  from public.periods periods
  where periods.id = new.period_id
  for update;

  if not found then
    raise exception 'OPENING_PERIOD_NOT_FOUND';
  end if;

  if selected_period.lifecycle_status = 'scheduled' then
    if selected_period.period_month > public.nodal_accounting_period_month(now()) then
      raise exception 'OPENING_PERIOD_NOT_DUE';
    end if;

    if exists (
      select 1
      from public.periods periods
      where periods.workspace_id = selected_period.workspace_id
        and periods.id <> selected_period.id
        and periods.lifecycle_status = 'open'
    ) then
      raise exception 'OPENING_PERIOD_CONFLICT';
    end if;

    update public.periods
    set lifecycle_status = 'open',
        opened_at = coalesce(opened_at, now()),
        closed_at = null
    where id = selected_period.id;

    insert into public.audit_events(
      actor_user_id, entity_table, entity_id, action, current_data, reason
    ) values (
      new.created_by,
      'periods',
      selected_period.id,
      'period_opened_after_opening_confirmation',
      jsonb_build_object(
        'lifecycle_status', 'open',
        'period_month', selected_period.period_month,
        'opening_snapshot_id', new.id
      ),
      'El punto de partida confirmado habilito el periodo operativo inicial'
    );
  elsif selected_period.lifecycle_status <> 'open' then
    raise exception 'OPENING_PERIOD_NOT_AVAILABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists period_opening_snapshots_open_period
on public.period_opening_snapshots;

create trigger period_opening_snapshots_open_period
after insert on public.period_opening_snapshots
for each row execute function public.open_nodal_period_after_opening_confirmation();

-- Repara aperturas ya confirmadas que quedaron programadas por haber sido
-- creadas antes del corte mensual. No inventa billeteras ni movimientos.
with repairable as (
  select periods.id, periods.period_month, snapshots.id as snapshot_id,
    snapshots.created_by
  from public.periods periods
  join public.period_opening_snapshots snapshots on snapshots.period_id = periods.id
  where periods.lifecycle_status = 'scheduled'
    and periods.period_month <= public.nodal_accounting_period_month(now())
    and not exists (
      select 1
      from public.periods active_periods
      where active_periods.workspace_id = periods.workspace_id
        and active_periods.id <> periods.id
        and active_periods.lifecycle_status = 'open'
    )
), repaired as (
  update public.periods periods
  set lifecycle_status = 'open',
      opened_at = coalesce(periods.opened_at, now()),
      closed_at = null
  from repairable
  where periods.id = repairable.id
  returning periods.id, periods.period_month, repairable.snapshot_id,
    repairable.created_by
)
insert into public.audit_events(
  actor_user_id, entity_table, entity_id, action, current_data, reason
)
select
  repaired.created_by,
  'periods',
  repaired.id,
  'period_opened_after_opening_repair',
  jsonb_build_object(
    'lifecycle_status', 'open',
    'period_month', repaired.period_month,
    'opening_snapshot_id', repaired.snapshot_id
  ),
  'Se reparo un periodo con apertura confirmada que permanecia programado'
from repaired;

create or replace function public.create_nodal_wallet(
  target_period_id uuid,
  target_name text,
  target_opening_balance_cents bigint,
  target_opened_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_workspace uuid;
  new_id uuid;
begin
  if actor_id is null or nullif(btrim(target_name), '') is null
    or target_opened_on is null or target_opening_balance_cents is null
    or target_opening_balance_cents < 0 then
    raise exception 'Invalid wallet';
  end if;

  select periods.workspace_id
  into selected_workspace
  from public.periods periods
  join public.workspaces spaces on spaces.id = periods.workspace_id
  where periods.id = target_period_id
    and spaces.owner_user_id = actor_id
    and spaces.modality = 'real'
    and periods.lifecycle_status = 'open'
  for update of periods;

  if not found then
    raise exception 'Wallet period is not open';
  end if;

  if not public.nodal_date_belongs_to_period(target_period_id, target_opened_on) then
    raise exception 'Wallet date is outside the open period';
  end if;

  insert into public.nodal_wallets(workspace_id, name, created_by, updated_by)
  values(selected_workspace, btrim(target_name), actor_id, actor_id)
  returning id into new_id;

  if target_opening_balance_cents > 0 then
    insert into public.wallet_movements(
      period_id, wallet_id, occurred_on, kind, amount_cents, fee_cents,
      observation, created_by, updated_by
    ) values (
      target_period_id, new_id, target_opened_on, 'external_contribution',
      target_opening_balance_cents, 0, 'Saldo inicial · aporte trader',
      actor_id, actor_id
    );
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    actor_id, 'nodal_wallets', new_id, 'wallet_created',
    jsonb_build_object(
      'name', btrim(target_name),
      'opening_balance_cents', target_opening_balance_cents,
      'period_id', target_period_id,
      'opened_on', target_opened_on
    ),
    'Billetera creada por el usuario'
  );

  return new_id;
end;
$$;

revoke all on function public.create_nodal_wallet(uuid,text,bigint,date)
from public, anon;
grant execute on function public.create_nodal_wallet(uuid,text,bigint,date)
to authenticated;

comment on function public.open_nodal_period_after_opening_confirmation()
is 'Abre el primer periodo real al confirmar su punto de partida y evita aperturas futuras o en conflicto.';

comment on function public.create_nodal_wallet(uuid,text,bigint,date)
is 'Agrega una billetera en cualquier momento del periodo real abierto y registra opcionalmente su saldo inicial como aporte.';
