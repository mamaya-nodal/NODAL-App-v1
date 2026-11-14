-- Keep name-only production classifiers unchanged. Temporary SIM admission is
-- authorized here by actor, connector, observed provenance, time and company.
do $$
declare definition text; phase_start text; phase_end text; new_phase text; start_at integer; end_at integer;
begin
  select pg_get_functiondef(oid) into strict definition from pg_proc
  where pronamespace='public'::regnamespace and proname='create_nodal_detected_purchase';
  if position('AUTHORIZED_SIM_REHEARSAL_20261114' in definition)>0 then return; end if;
  phase_start := 'detected_phase := public.nodal_detected_ninja_phase(target_external_account_name);';
  phase_end := 'detected_initial_balance_cents := public.nodal_detected_ninja_initial_balance_cents(target_external_account_name);';
  new_phase := $patch$
    -- AUTHORIZED_SIM_REHEARSAL_20261114
    if actor_id='f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid
      and target_connector_id in ('4f72f0d2-c11f-4d26-85f7-4116f656c94a'::uuid,'ce4c4ef6-306f-4042-983f-85dae86b74ae'::uuid)
      and upper(btrim(target_external_account_name))='SIM101'
      and lower(btrim(target_connection_name)) in ('simulated data feed','trasmision de datos simulados')
      and now()>='2026-11-14T20:45:00Z'::timestamptz and now()<'2026-11-16T03:00:00Z'::timestamptz
      and observed_account->>'nodalTestPhysicalConnectorId'=target_connector_id::text
      and exists(select 1 from public.companies where id=target_company_id and code='LUCID') then
      detected_phase := 'Evaluation'; detected_initial_balance_cents := 5000000;
    else
      detected_phase := public.nodal_detected_ninja_phase(target_external_account_name);
      if detected_phase is null then raise exception 'Ninja account phase is not recognized'; end if;
      detected_initial_balance_cents := public.nodal_detected_ninja_initial_balance_cents(target_external_account_name);
    end if;
  $patch$;
  start_at:=position(phase_start in definition); end_at:=position(phase_end in definition)+length(phase_end);
  if start_at=0 or end_at<=start_at then raise exception 'SIM_REGISTRATION_PHASE_ANCHOR_MISSING'; end if;
  definition:=overlay(definition placing new_phase from start_at for end_at-start_at);
  if position('account->>''connectionName''=btrim(target_connection_name)' in definition)=0 then
    raise exception 'SIM_REGISTRATION_OBSERVATION_ANCHOR_MISSING';
  end if;
  definition:=replace(definition,'account->>''connectionName''=btrim(target_connection_name)',
    'btrim(account->>''connectionName'')=btrim(target_connection_name)');
  definition:=replace(definition,'reviews.connection_name=btrim(target_connection_name)',
    'btrim(reviews.connection_name)=btrim(target_connection_name)');
  definition:=replace(definition,'if observed_account is null then raise exception ''Ninja account was not observed for this user''; end if;',
    'if observed_account is null then raise exception ''Ninja account was not observed for this user''; end if; target_connection_name := observed_account->>''connectionName'';');
  definition:=replace(definition,'links.connection_name=btrim(target_connection_name)','links.connection_name=target_connection_name');
  definition:=replace(definition,'values(new_account_id,target_connector_id,btrim(target_connection_name),',
    'values(new_account_id,target_connector_id,target_connection_name,');
  definition:=replace(definition,'''connection_name'',btrim(target_connection_name)',
    '''connection_name'',target_connection_name');
  execute definition;
end;
$$;
