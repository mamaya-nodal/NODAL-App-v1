-- La invariante de conciliación debe validar tanto participantes derivados de
-- telemetría prop como cuentas asignadas por el flujo manual auditado. La
-- versión anterior rechazaba todo lote manual al confirmar la transacción.

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
  participant_count integer := 0;
begin
  if new.accounting_status <> 'committed' then return new; end if;
  if new.daily_control_id is null then
    raise exception 'NINJA_COMMITTED_WITHOUT_DAILY_CONTROL';
  end if;

  for member in
    select technical.account_id, technical.allocated_broker_result_cents
    from public.ninja_operation_batch_members technical
    where technical.batch_id = new.id and technical.role = 'prop'
    union all
    select manual.account_id, manual.allocated_broker_result_cents
    from public.ninja_operation_batch_manual_accounts manual
    where manual.batch_id = new.id
  loop
    participant_count := participant_count + 1;

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

  if participant_count = 0 then
    raise exception 'NINJA_RECONCILIATION_WITHOUT_PROP_ACCOUNTS';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_ninja_reconciliation_accounts_invariant()
from public, anon, authenticated;
