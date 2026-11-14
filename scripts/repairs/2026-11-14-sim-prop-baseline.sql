-- Before any rehearsal execution or account registration: reset ONLY the
-- derived Sim101 progress seeded by the old demo cash. Raw telemetry is kept.
begin;
do $$
declare s record; current_cash numeric; new_lives jsonb; touched integer:=0;
begin
  if exists(select 1 from public.ninja_operation_probe_sessions
    where connector_id in ('4f72f0d2-c11f-4d26-85f7-4116f656c94a','ce4c4ef6-306f-4042-983f-85dae86b74ae')
      and opened_at >= '2026-11-14T20:45:00Z') then raise exception 'TEST_ALREADY_HAS_OPERATIONS'; end if;
  if exists(select 1 from public.ninja_account_links
    where connector_id in ('4f72f0d2-c11f-4d26-85f7-4116f656c94a','ce4c4ef6-306f-4042-983f-85dae86b74ae')
      and external_account_name='Sim101') then raise exception 'TEST_ALREADY_REGISTERED'; end if;
  for s in select * from public.ninja_transition_states
    where connector_id in ('4f72f0d2-c11f-4d26-85f7-4116f656c94a','ce4c4ef6-306f-4042-983f-85dae86b74ae')
    order by connector_id for update
  loop
    select (a->>'cashValue')::numeric into current_cash
    from (select accounts from public.ninja_inventory_snapshots
      where connector_id=s.connector_id and physical_connector_id=s.connector_id
      order by observed_at desc limit 1) latest,
      jsonb_array_elements(latest.accounts) a
    where a->>'accountName'='Sim101';
    if current_cash is distinct from 50000 then raise exception 'SIM101_NOT_RESET_TO_50000'; end if;
    select jsonb_agg(case when l->'tracked'->>'externalAccountName'='Sim101'
      then jsonb_set(l,'{tracked}',(l->'tracked') || jsonb_build_object(
        'balanceInCents',5000000,'highestEodBalanceInCents',5000000,'reachedEvaluationTarget',false))
      else l end order by ordinal) into new_lives
    from jsonb_array_elements(s.state->'lives') with ordinality items(l,ordinal);
    insert into public.audit_events(actor_user_id,entity_table,entity_id,action,previous_data,current_data,reason)
    values('f2f5f816-ec4f-46e1-b216-5267aeadc635','ninja_transition_states',s.connector_id,
      'sim101_starting_equity_reset_20261114',jsonb_build_object('state',s.state,'revision',s.revision),
      jsonb_build_object('lives',new_lives),'Preparar prueba sin trades: el usuario restablecio SIM a 50000; quitar objetivo ficticio derivado de saldo demo anterior; preservar telemetria y otras vidas');
    update public.ninja_transition_states set state=jsonb_set(s.state,'{lives}',new_lives),revision=s.revision+1
    where connector_id=s.connector_id;
    touched:=touched+1;
  end loop;
  if touched<>2 then raise exception 'EXPECTED_TWO_TEST_INSTALLATIONS'; end if;
end;
$$;
commit;
select connector_id,l->'tracked' as tracked
from public.ninja_transition_states s cross join lateral jsonb_array_elements(s.state->'lives') l
where connector_id in ('4f72f0d2-c11f-4d26-85f7-4116f656c94a','ce4c4ef6-306f-4042-983f-85dae86b74ae')
  and l->'tracked'->>'externalAccountName'='Sim101';
