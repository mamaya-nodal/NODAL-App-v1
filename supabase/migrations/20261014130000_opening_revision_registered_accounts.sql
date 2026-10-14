-- Una cuenta comprada pero nunca operada puede conservarse al rehacer la
-- apertura. Su compra queda absorbida por el nuevo corte y no se vuelve a
-- declarar como lote agregado, evitando duplicar cuentas o costos.

create or replace function public.nodal_period_opening_has_activity(target_period_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists(select 1 from public.daily_controls where period_id = target_period_id)
    or exists(select 1 from public.operation_entries where period_id = target_period_id)
    or exists(select 1 from public.wallet_movements where period_id = target_period_id)
    or exists(select 1 from public.funding_withdrawals where period_id = target_period_id)
    or exists(select 1 from public.account_phase_withdrawals where period_id = target_period_id)
    or exists(select 1 from public.account_period_carryovers where to_period_id = target_period_id)
    or exists(select 1 from public.period_closure_versions where period_id = target_period_id)
    or exists(select 1 from public.period_rectifications where adjustment_period_id = target_period_id);
$$;

revoke all on function public.nodal_period_opening_has_activity(uuid)
from public, anon, authenticated;

create or replace function public.guard_revised_opening_registered_accounts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revision_number > old.revision_number
    and exists(select 1 from public.accounts where period_id = new.period_id)
    and (
      new.virgin_accounts <> 0
      or new.live_evaluation_accounts <> 0
      or new.funded_accounts <> 0
    ) then
    raise exception 'OPENING_REVISION_REGISTERED_ACCOUNTS';
  end if;
  return new;
end;
$$;

create trigger period_opening_revision_registered_accounts_guard
before update on public.period_opening_snapshots
for each row execute function public.guard_revised_opening_registered_accounts();

create or replace function public.guard_revised_opening_account_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.period_opening_snapshots snapshots
    where snapshots.id = new.opening_snapshot_id
      and snapshots.revision_number > 1
      and exists (
        select 1 from public.accounts where period_id = snapshots.period_id
      )
  ) then
    raise exception 'OPENING_REVISION_REGISTERED_ACCOUNTS';
  end if;
  return new;
end;
$$;

create trigger period_opening_revision_account_batch_guard
before insert on public.period_opening_account_batches
for each row execute function public.guard_revised_opening_account_batch();
