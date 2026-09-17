-- Cuando una cobertura se asigna manualmente a cuentas detectadas por Ninja,
-- conserva también la sesión técnica correspondiente. Esto permite mostrar
-- cada trade por su Control Diario, aun si hubo varios el mismo día.

create or replace function public.attach_ninja_sessions_to_manual_coverage_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ninja_operation_batch_members(
    batch_id,
    session_id,
    account_id,
    role,
    allocated_broker_result_cents
  )
  select
    new.batch_id,
    sessions.id,
    new.account_id,
    'prop',
    new.allocated_broker_result_cents
  from public.ninja_operation_batches batches
  join public.ninja_account_links links
    on links.connector_id = batches.connector_id
   and links.account_id = new.account_id
  join public.ninja_operation_probe_sessions sessions
    on sessions.connector_id = batches.connector_id
   and sessions.connection_name = links.connection_name
   and sessions.account_name = links.external_account_name
  where batches.id = new.batch_id
    and sessions.status = 'closed'
    and sessions.excluded_at is null
    and abs(extract(epoch from (sessions.opened_at - batches.opened_at))) <= 30
    and (
      batches.settled_at is null
      or sessions.settled_at is null
      or abs(extract(epoch from (sessions.settled_at - batches.settled_at))) <= 30
    )
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.attach_ninja_sessions_to_manual_coverage_assignment()
from public, anon, authenticated;

drop trigger if exists ninja_manual_coverage_assignment_attach_sessions
on public.ninja_operation_batch_manual_accounts;
create trigger ninja_manual_coverage_assignment_attach_sessions
after insert or update of account_id, allocated_broker_result_cents
on public.ninja_operation_batch_manual_accounts
for each row execute function public.attach_ninja_sessions_to_manual_coverage_assignment();

-- Repara las conciliaciones manuales ya registradas sin modificar sus importes,
-- estados ni saldos.
insert into public.ninja_operation_batch_members(
  batch_id,
  session_id,
  account_id,
  role,
  allocated_broker_result_cents
)
select
  assignments.batch_id,
  sessions.id,
  assignments.account_id,
  'prop',
  assignments.allocated_broker_result_cents
from public.ninja_operation_batch_manual_accounts assignments
join public.ninja_operation_batches batches on batches.id = assignments.batch_id
join public.ninja_account_links links
  on links.connector_id = batches.connector_id
 and links.account_id = assignments.account_id
join public.ninja_operation_probe_sessions sessions
  on sessions.connector_id = batches.connector_id
 and sessions.connection_name = links.connection_name
 and sessions.account_name = links.external_account_name
where sessions.status = 'closed'
  and sessions.excluded_at is null
  and abs(extract(epoch from (sessions.opened_at - batches.opened_at))) <= 30
  and (
    batches.settled_at is null
    or sessions.settled_at is null
    or abs(extract(epoch from (sessions.settled_at - batches.settled_at))) <= 30
  )
on conflict do nothing;
