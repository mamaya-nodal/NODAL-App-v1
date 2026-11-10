-- Una conciliación automática sólo puede quedar committed si su proyección en
-- Control Diario, Registro de Operaciones y Cuentas está completa.

create or replace function public.enforce_ninja_reconciliation_accounts_invariant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member record;
  participant_amount bigint;
  entry_amount bigint;
begin
  if new.accounting_status <> 'committed' then return new; end if;
  if new.daily_control_id is null then
    raise exception 'NINJA_COMMITTED_WITHOUT_DAILY_CONTROL';
  end if;

  for member in
    select members.account_id, members.allocated_broker_result_cents
    from public.ninja_operation_batch_members members
    where members.batch_id = new.id and members.role = 'prop'
  loop
    select participants.allocated_result_cents into participant_amount
    from public.daily_control_participants participants
    where participants.daily_control_id = new.daily_control_id
      and participants.account_id = member.account_id;
    if not found or participant_amount <> member.allocated_broker_result_cents then
      raise exception 'NINJA_RECONCILIATION_PARTICIPANT_MISMATCH';
    end if;

    select case entries.destination
      when 'NETO BROKER +' then entries.magnitude_cents
      when 'NETO BROKER -' then -entries.magnitude_cents
      else 0 end
    into entry_amount
    from public.operation_entries entries
    where entries.daily_control_id = new.daily_control_id
      and entries.account_id = member.account_id;
    if not found or entry_amount <> member.allocated_broker_result_cents then
      raise exception 'NINJA_RECONCILIATION_ACCOUNT_ENTRY_MISMATCH';
    end if;

    perform public.recalculate_nodal_account_state(member.account_id);
  end loop;

  if not exists (
    select 1 from public.ninja_operation_batch_members members
    where members.batch_id = new.id and members.role = 'prop'
  ) then
    raise exception 'NINJA_RECONCILIATION_WITHOUT_PROP_ACCOUNTS';
  end if;
  return new;
end;
$$;

drop trigger if exists ninja_reconciliation_accounts_invariant
on public.ninja_operation_batches;
create constraint trigger ninja_reconciliation_accounts_invariant
after insert or update
on public.ninja_operation_batches
deferrable initially deferred
for each row execute function public.enforce_ninja_reconciliation_accounts_invariant();

revoke all on function public.enforce_ninja_reconciliation_accounts_invariant()
from public, anon, authenticated;

-- Una lectura posterior nunca debe reabrir una vida quemada.
drop trigger if exists ninja_account_change_events_recover_false_burn
on public.ninja_account_change_events;

