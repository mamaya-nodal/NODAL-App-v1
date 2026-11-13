-- A later repair must preserve the same invariant as the initial commit.
begin;
create or replace function public.validate_ninja_control_projection(target_control uuid)
returns void language plpgsql security definer set search_path='' as $$
declare b record;
begin
  for b in select id from public.ninja_operation_batches
    where daily_control_id=target_control and accounting_status='committed'
  loop
    if not exists(select 1 from public.ninja_operation_batch_members where batch_id=b.id and role='prop')
      and not exists(select 1 from public.ninja_operation_batch_manual_accounts where batch_id=b.id) then
      raise exception 'NINJA_RECONCILIATION_WITHOUT_PROP_ACCOUNTS';
    end if;
    if exists (
      with expected as (
        select account_id,allocated_broker_result_cents amount from public.ninja_operation_batch_members where batch_id=b.id and role='prop'
        union
        select account_id,allocated_broker_result_cents from public.ninja_operation_batch_manual_accounts where batch_id=b.id
      ), participants as (
        select account_id,allocated_result_cents amount from public.daily_control_participants where daily_control_id=target_control
      ), entries as (
        select account_id,case destination when 'NETO BROKER +' then magnitude_cents when 'NETO BROKER -' then -magnitude_cents else 0 end amount
        from public.operation_entries where daily_control_id=target_control
      )
      select 1 from expected e full join participants p on p.account_id=e.account_id
      full join entries o on o.account_id=coalesce(e.account_id,p.account_id)
      where e.account_id is null or p.account_id is null or o.account_id is null
        or e.amount is distinct from p.amount or e.amount is distinct from o.amount
    ) then raise exception 'NINJA_RECONCILIATION_PROJECTION_MISMATCH'; end if;
  end loop;
end $$;
revoke all on function public.validate_ninja_control_projection(uuid) from public,anon,authenticated;

create or replace function public.enforce_ninja_projection_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
declare prior_control uuid; next_control uuid;
begin
  if tg_table_name in ('operation_entries','daily_control_participants') then
    if tg_op<>'INSERT' then prior_control:=old.daily_control_id; end if;
    if tg_op<>'DELETE' then next_control:=new.daily_control_id; end if;
  else
    if tg_op<>'INSERT' then select daily_control_id into prior_control from public.ninja_operation_batches where id=old.batch_id; end if;
    if tg_op<>'DELETE' then select daily_control_id into next_control from public.ninja_operation_batches where id=new.batch_id; end if;
  end if;
  if prior_control is not null then perform public.validate_ninja_control_projection(prior_control); end if;
  if next_control is not null and next_control is distinct from prior_control then perform public.validate_ninja_control_projection(next_control); end if;
  return null;
end $$;
revoke all on function public.enforce_ninja_projection_mutation() from public,anon,authenticated;
create constraint trigger ninja_entry_projection_guard after insert or update or delete on public.operation_entries
  deferrable initially deferred for each row execute function public.enforce_ninja_projection_mutation();
create constraint trigger ninja_participant_projection_guard after insert or update or delete on public.daily_control_participants
  deferrable initially deferred for each row execute function public.enforce_ninja_projection_mutation();
create constraint trigger ninja_member_projection_guard after insert or update or delete on public.ninja_operation_batch_members
  deferrable initially deferred for each row execute function public.enforce_ninja_projection_mutation();
create constraint trigger ninja_manual_projection_guard after insert or update or delete on public.ninja_operation_batch_manual_accounts
  deferrable initially deferred for each row execute function public.enforce_ninja_projection_mutation();
commit;
