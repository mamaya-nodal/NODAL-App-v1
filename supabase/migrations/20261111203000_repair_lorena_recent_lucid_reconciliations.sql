-- Reconstruye cronologicamente la cadena Lucid reciente de Lorena.
-- Conserva como descubiertos los dos cambios broker sin replicas y recupera
-- las operaciones cubiertas desde los lotes y sesiones tecnicas originales.

begin;

create schema if not exists private_lorena_recent_repair_20261111;
revoke all on schema private_lorena_recent_repair_20261111 from public, anon, authenticated;

create table if not exists private_lorena_recent_repair_20261111.daily_controls as
select * from public.daily_controls
where period_id = '6325a8a9-1ac4-469b-84fa-08e040faf81b'::uuid;

create table if not exists private_lorena_recent_repair_20261111.daily_control_participants as
select * from public.daily_control_participants
where period_id = '6325a8a9-1ac4-469b-84fa-08e040faf81b'::uuid;

create table if not exists private_lorena_recent_repair_20261111.operation_entries as
select * from public.operation_entries
where period_id = '6325a8a9-1ac4-469b-84fa-08e040faf81b'::uuid;

create table if not exists private_lorena_recent_repair_20261111.ninja_account_links as
select * from public.ninja_account_links
where connector_id = 'cfefc40f-e916-4469-aae8-47a508ac7a42'::uuid;

create table if not exists private_lorena_recent_repair_20261111.ninja_operation_batches as
select * from public.ninja_operation_batches
where id = any(array[
  'e2f0cb6f-2cb9-492b-918d-fd5152c7e680'::uuid,
  '77f193e2-bcb1-4702-bac2-1ef5fa80dc67'::uuid,
  '2aa1ad65-a7c2-4ec6-88f9-ff97cbc501ee'::uuid,
  '60542b96-0469-4d30-b6ae-df30f14f3136'::uuid
]);

create table if not exists private_lorena_recent_repair_20261111.ninja_operation_batch_members as
select * from public.ninja_operation_batch_members
where batch_id = any(array[
  'e2f0cb6f-2cb9-492b-918d-fd5152c7e680'::uuid,
  '77f193e2-bcb1-4702-bac2-1ef5fa80dc67'::uuid,
  '2aa1ad65-a7c2-4ec6-88f9-ff97cbc501ee'::uuid,
  '60542b96-0469-4d30-b6ae-df30f14f3136'::uuid
]);

create table if not exists private_lorena_recent_repair_20261111.ninja_broker_balance_events as
select * from public.ninja_broker_balance_events
where connector_id = 'cfefc40f-e916-4469-aae8-47a508ac7a42'::uuid
  and observed_at >= timestamptz '2026-11-05 00:00:00+00';

do $repair$
declare
  lore_id constant uuid := '2b0f63da-bf32-41ee-86c2-98fb5dbe583b';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_period_id constant uuid := '6325a8a9-1ac4-469b-84fa-08e040faf81b';
  target_connector_id constant uuid := 'cfefc40f-e916-4469-aae8-47a508ac7a42';
  lucid_id constant uuid := '31f7ac9f-21c4-4322-b188-a6af31d882bd';
  account_11 constant uuid := '27081dc8-799e-4582-8509-4442d191c17a';
  account_12 constant uuid := '6ce91571-4c8a-4a4e-93d7-8caefd4aa412';
  account_13 constant uuid := '7aea7feb-4135-4841-ade3-b22d28f8e636';
  account_14 constant uuid := 'c5e6c1ff-b6b7-4007-accf-e409792ebfbc';
  account_15 constant uuid := 'ca853e0c-f168-4119-bdaf-f7735a3d8723';
  funded_ids constant uuid[] := array[account_11,account_12,account_13,account_14,account_15];
  eval_ids constant uuid[] := array[account_12,account_13,account_14,account_15];
  batch_22 constant uuid := 'e2f0cb6f-2cb9-492b-918d-fd5152c7e680';
  batch_24 constant uuid := '77f193e2-bcb1-4702-bac2-1ef5fa80dc67';
  batch_25 constant uuid := '2aa1ad65-a7c2-4ec6-88f9-ff97cbc501ee';
  batch_27 constant uuid := '60542b96-0469-4d30-b6ae-df30f14f3136';
  control_21 uuid; control_22 uuid; control_23 uuid; control_24 uuid;
  control_25 uuid; control_26 uuid; control_27 uuid;
begin
  if exists (
    select 1 from public.audit_events
    where entity_table='periods' and entity_id=target_period_id
      and action='lorena_recent_lucid_reconciliation_chain_repaired'
  ) then return; end if;

  if (select count(*) from public.daily_controls where period_id=target_period_id) <> 20
    or not exists (
      select 1 from public.daily_controls
      where period_id=target_period_id and control_number=20 and balance_after_cents=841070
    )
  then raise exception 'Lorena control chain changed; aborting recent reconstruction'; end if;

  if (select count(*) from public.ninja_account_links
      where connector_id=target_connector_id and account_id=any(funded_ids)
        and closed_at is null and phase='Funded') <> 5
  then raise exception 'Expected five active Lorena funded accounts'; end if;

  if exists (
    select 1 from public.ninja_operation_batches
    where id=any(array[batch_22,batch_24,batch_25,batch_27])
      and (accounting_status='committed' or daily_control_id is not null)
  ) then raise exception 'A Lorena target batch is already committed'; end if;

  -- El cambio de 8410,70 a 7893,82 no tiene ejecuciones ni variacion en
  -- ninguna cuenta prop: se conserva como resultado broker descubierto.
  insert into public.daily_controls(
    period_id,control_number,operated_on,kind,balance_before_cents,
    balance_after_cents,operating_result_cents,observations,source,
    source_event_key,received_balance_cents,confirmation_key,
    created_by,updated_by,is_uncovered
  ) values (
    target_period_id,21,date '2026-11-06','balance_update',841070,789382,-51688,
    'Cambio broker sin ejecuciones ni variación en cuentas prop; conservado como operación sin cobertura.',
    'ninjatrader','ninja-preoperation:1145294',789382,
    '10e10000-0000-4000-8000-000000000021',lore_id,admin_id,true
  ) returning id into control_21;

  -- Lote del 06/11: cuatro cuentas Evaluation.
  insert into public.daily_controls(
    period_id,control_number,operated_on,kind,balance_before_cents,
    balance_after_cents,operating_result_cents,company_id,leader_account_id,
    phase,observations,source,source_event_key,received_balance_cents,
    confirmation_key,created_by,updated_by,is_uncovered
  ) values (
    target_period_id,22,date '2026-11-06','balance_update',789382,764330,-25052,
    lucid_id,account_12,'Evaluacion','Conciliación automática recuperada después de restablecer la continuidad broker.',
    'ninjatrader','ninja-operation:1145294',764330,batch_22,lore_id,admin_id,false
  ) returning id into control_22;

  -- Sesiones Evaluation del 09/11 que sí existen en la telemetría, pero no
  -- formaron lote porque no llegó una sesión broker separada para ese tramo.
  insert into public.daily_controls(
    period_id,control_number,operated_on,kind,balance_before_cents,
    balance_after_cents,operating_result_cents,company_id,leader_account_id,
    phase,observations,source,source_event_key,received_balance_cents,
    confirmation_key,created_by,updated_by,is_uncovered
  ) values (
    target_period_id,23,date '2026-11-09','balance_update',764330,700160,-64170,
    lucid_id,account_12,'Evaluacion','Conciliación recuperada desde cuatro sesiones Lucid Evaluation y continuidad exacta del saldo broker.',
    'ninjatrader','session-recovery:lore:2026-11-09:eval',700160,
    '10e10000-0000-4000-8000-000000000023',lore_id,admin_id,false
  ) returning id into control_23;

  -- El lote Funded del 09/11 quedó unmatched porque las réplicas abrieron 50 s
  -- después; sus cierres coinciden dentro de 369 ms con el broker.
  insert into public.ninja_operation_batch_members(
    batch_id,session_id,account_id,role,allocated_broker_result_cents
  ) values
    (batch_24,3344285,account_11,'prop',-3844),
    (batch_24,3344279,account_12,'prop',-3844),
    (batch_24,3344280,account_13,'prop',-3844),
    (batch_24,3344286,account_14,'prop',-3844),
    (batch_24,3344289,account_15,'prop',-3844)
  on conflict (batch_id,session_id) do nothing;

  update public.ninja_operation_batches
  set status='ready',distributed_cents=-19220,rounding_difference_cents=0,
    accounting_mode='active',accounting_period_id=target_period_id,
    accounting_company_id=lucid_id,accounting_phase='Primera vuelta',
    operated_on=date '2026-11-09',updated_at=now()
  where id=batch_24;

  insert into public.daily_controls(
    period_id,control_number,operated_on,kind,balance_before_cents,
    balance_after_cents,operating_result_cents,company_id,leader_account_id,
    phase,observations,source,source_event_key,received_balance_cents,
    confirmation_key,created_by,updated_by,is_uncovered
  ) values
    (target_period_id,24,date '2026-11-09','balance_update',700160,680940,-19220,
      lucid_id,account_11,'Primera vuelta','Conciliación recuperada: cinco réplicas abrieron 50 s después del broker y cerraron juntas.',
      'ninjatrader','ninja-operation:1191318',680940,batch_24,lore_id,admin_id,false),
    (target_period_id,25,date '2026-11-10','balance_update',680940,772866,91926,
      lucid_id,account_11,'Primera vuelta','Conciliación automática recuperada después de reconstruir la cadena previa.',
      'ninjatrader','ninja-operation:1201155',772866,batch_25,lore_id,admin_id,false),
    (target_period_id,26,date '2026-11-11','balance_update',772866,754152,-18714,
      null,null,null,'Cambio broker previo sin ejecuciones ni variación en cuentas prop; conservado como operación sin cobertura.',
      'ninjatrader','balance-gap:lore:2026-11-11:preoperation',754152,
      '10e10000-0000-4000-8000-000000000026',lore_id,admin_id,true),
    (target_period_id,27,date '2026-11-11','balance_update',754152,748578,-5574,
      lucid_id,account_11,'Primera vuelta','Conciliación automática recuperada después de registrar la diferencia broker previa.',
      'ninjatrader','ninja-operation:1222597',748578,batch_27,lore_id,admin_id,false)
  ;

  -- PostgreSQL no asigna cuatro RETURNING a variables escalares; resolverlos
  -- por sus claves únicas ya insertadas.
  select id into control_24 from public.daily_controls where period_id=target_period_id and control_number=24;
  select id into control_25 from public.daily_controls where period_id=target_period_id and control_number=25;
  select id into control_26 from public.daily_controls where period_id=target_period_id and control_number=26;
  select id into control_27 from public.daily_controls where period_id=target_period_id and control_number=27;

  -- Participantes y registro de Cuentas para los cinco controles cubiertos.
  insert into public.daily_control_participants(daily_control_id,period_id,account_id,role,allocated_result_cents)
  select control_22,target_period_id,m.account_id,
    case when m.account_id=account_12 then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,
    m.allocated_broker_result_cents
  from public.ninja_operation_batch_members m where m.batch_id=batch_22 and m.role='prop'
  union all
  select control_23,target_period_id,x.account_id,
    case when x.ordinality=1 then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,
    x.amount
  from unnest(eval_ids,array[-16043,-16043,-16042,-16042]::bigint[]) with ordinality x(account_id,amount,ordinality)
  union all
  select control_24,target_period_id,m.account_id,
    case when m.account_id=account_11 then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,
    m.allocated_broker_result_cents
  from public.ninja_operation_batch_members m where m.batch_id=batch_24 and m.role='prop'
  union all
  select control_25,target_period_id,m.account_id,
    case when m.account_id=account_11 then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,
    m.allocated_broker_result_cents
  from public.ninja_operation_batch_members m where m.batch_id=batch_25 and m.role='prop'
  union all
  select control_27,target_period_id,m.account_id,
    case when m.account_id=account_11 then 'leader'::public.daily_control_participant_role else 'replica'::public.daily_control_participant_role end,
    m.allocated_broker_result_cents
  from public.ninja_operation_batch_members m where m.batch_id=batch_27 and m.role='prop';

  insert into public.operation_entries(
    period_id,daily_control_id,account_id,operated_on,phase,
    participant_role,destination,magnitude_cents,created_by,updated_by
  )
  select p.period_id,p.daily_control_id,p.account_id,c.operated_on,c.phase,p.role,
    case when p.allocated_result_cents>0 then 'NETO BROKER +'::public.broker_result_destination
      when p.allocated_result_cents<0 then 'NETO BROKER -'::public.broker_result_destination
      else 'NONE'::public.broker_result_destination end,
    abs(p.allocated_result_cents),lore_id,admin_id
  from public.daily_control_participants p
  join public.daily_controls c on c.id=p.daily_control_id
  where p.daily_control_id=any(array[control_22,control_23,control_24,control_25,control_27]);

  update public.ninja_operation_batches b
  set status='ready',accounting_mode='active',accounting_status='committed',
    accounting_blocking_reason=null,accounting_period_id=target_period_id,
    accounting_company_id=lucid_id,daily_control_id=map.control_id,updated_at=now()
  from (values
    (batch_22,control_22,'Evaluacion'::public.operation_phase,date '2026-11-06'),
    (batch_24,control_24,'Primera vuelta'::public.operation_phase,date '2026-11-09'),
    (batch_25,control_25,'Primera vuelta'::public.operation_phase,date '2026-11-10'),
    (batch_27,control_27,'Primera vuelta'::public.operation_phase,date '2026-11-11')
  ) map(batch_id,control_id,phase,operated_on)
  where b.id=map.batch_id;

  update public.ninja_operation_batches b
  set accounting_phase=map.phase,operated_on=map.operated_on
  from (values
    (batch_22,'Evaluacion'::public.operation_phase,date '2026-11-06'),
    (batch_24,'Primera vuelta'::public.operation_phase,date '2026-11-09'),
    (batch_25,'Primera vuelta'::public.operation_phase,date '2026-11-10'),
    (batch_27,'Primera vuelta'::public.operation_phase,date '2026-11-11')
  ) map(batch_id,phase,operated_on)
  where b.id=map.batch_id;

  update public.ninja_broker_balance_events e
  set status='confirmed',daily_control_id=map.control_id,resolved_at=coalesce(e.resolved_at,now())
  from (values
    ('ninja-preoperation:1145294',control_21),
    ('ninja-operation:1145294',control_22),
    ('ninja-operation:1191318',control_24),
    ('ninja-operation:1201155',control_25),
    ('ninja-operation:1222597',control_27)
  ) map(source_event_id,control_id)
  where e.connector_id=target_connector_id and e.source_event_id=map.source_event_id;

  update public.ninja_account_links
  set accounting_phase='Primera vuelta',completed_trade_days=0
  where connector_id=target_connector_id and account_id=any(funded_ids) and closed_at is null;

  perform public.recalculate_nodal_account_state(x.account_id)
  from unnest(funded_ids) x(account_id);

  if (select count(*) from public.daily_controls where period_id=target_period_id)<>27
    or (select balance_after_cents from public.daily_controls where period_id=target_period_id and control_number=27)<>748578
    or (select count(*) from public.daily_control_participants where daily_control_id=any(array[control_22,control_23,control_24,control_25,control_27]))<>23
    or (select count(*) from public.operation_entries where daily_control_id=any(array[control_22,control_23,control_24,control_25,control_27]))<>23
    or exists(select 1 from public.ninja_operation_batches where id=any(array[batch_22,batch_24,batch_25,batch_27]) and (accounting_status<>'committed' or daily_control_id is null))
    or (select count(*) from public.ninja_account_links where connector_id=target_connector_id and account_id=any(funded_ids) and closed_at is null and accounting_phase='Primera vuelta' and completed_trade_days=0)<>5
  then raise exception 'Lorena recent reconciliation integrity check failed'; end if;

  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(admin_id,'periods',target_period_id,'lorena_recent_lucid_reconciliation_chain_repaired',
    jsonb_build_object(
      'backup_schema','private_lorena_recent_repair_20261111',
      'controls_created',7,'covered_controls',5,'uncovered_controls',2,
      'first_balance_cents',841070,'final_balance_cents',748578,
      'committed_batches',jsonb_build_array(batch_22,batch_24,batch_25,batch_27),
      'delayed_replica_batch',batch_24,'delayed_replica_seconds',50,
      'telemetry_deleted',false
    ),
    'Reconstrucción cronológica desde saldos, lotes y sesiones originales; sin inventar cobertura para los dos cambios broker sin réplicas.');
end;
$repair$;

commit;
