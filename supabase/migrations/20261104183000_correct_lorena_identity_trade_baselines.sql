-- Las recuperaciones de Lore ya poseen una entrada contable por trade. Las
-- columnas completed_trade_days deben conservar sólo el avance previo al
-- primer asiento, para evitar que la interfaz cuente los mismos trades dos veces.

begin;

create schema if not exists private_lorena_identity_day_fix_20261104;
revoke all on schema private_lorena_identity_day_fix_20261104 from public, anon, authenticated;

create table if not exists private_lorena_identity_day_fix_20261104.ninja_account_links as
select * from public.ninja_account_links
where account_id = any(array[
  'b8d9d714-b8d3-4b6d-be52-fb45582189d6'::uuid,
  'c2bd2e83-2d4c-4d2d-8dcf-6956b4ea4e7a'::uuid,
  'f8dc962a-f8a1-4da9-b73a-11a3b7d03060'::uuid,
  '8b898601-f1de-47e4-a6fd-51fa1ea1d4f8'::uuid,
  '08b81982-08a4-424c-aba2-b69a09b8cd64'::uuid,
  '47833c78-4c4a-41fb-9fa1-a8a592511e58'::uuid,
  'd2b7774b-21b4-474b-acc3-58fd23554713'::uuid,
  'd78bee95-7456-45ae-adb3-d3aa6cbec434'::uuid,
  '59c05fac-cb20-44c2-a2b1-4922ed5b1b6e'::uuid,
  'a85ed3b6-c226-4c67-baa8-5c982e38f13a'::uuid
]);

do $repair$
declare
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_period_id constant uuid := '6325a8a9-1ac4-469b-84fa-08e040faf81b';
  david_connector_id constant uuid := 'a697d39d-a2c6-439f-aa8a-fc9075da40e5';
  gino_connector_id constant uuid := '45f42900-1fb7-419f-97f7-532d210083a9';
  david_account_ids constant uuid[] := array[
    'b8d9d714-b8d3-4b6d-be52-fb45582189d6'::uuid,
    'c2bd2e83-2d4c-4d2d-8dcf-6956b4ea4e7a'::uuid,
    'f8dc962a-f8a1-4da9-b73a-11a3b7d03060'::uuid,
    '8b898601-f1de-47e4-a6fd-51fa1ea1d4f8'::uuid,
    '08b81982-08a4-424c-aba2-b69a09b8cd64'::uuid
  ];
  gino_account_ids constant uuid[] := array[
    '47833c78-4c4a-41fb-9fa1-a8a592511e58'::uuid,
    'd2b7774b-21b4-474b-acc3-58fd23554713'::uuid,
    'd78bee95-7456-45ae-adb3-d3aa6cbec434'::uuid,
    '59c05fac-cb20-44c2-a2b1-4922ed5b1b6e'::uuid,
    'a85ed3b6-c226-4c67-baa8-5c982e38f13a'::uuid
  ];
begin
  if exists (
    select 1 from public.audit_events
    where entity_table = 'periods' and entity_id = target_period_id
      and action = 'lorena_identity_trade_baselines_corrected'
  ) then return; end if;

  if (select count(*) from public.ninja_account_links
      where connector_id = david_connector_id and account_id = any(david_account_ids)
        and closed_at is null and accounting_phase = 'Evaluacion'
        and completed_trade_days = 2) <> 5
    or (select count(*) from public.operation_entries
        where account_id = any(david_account_ids)) <> 10
  then raise exception 'David day evidence changed'; end if;

  if (select count(*) from public.ninja_account_links
      where connector_id = gino_connector_id and account_id = any(gino_account_ids)
        and closed_at is null and accounting_phase = 'Evaluacion'
        and completed_trade_days = 1) <> 5
    or (select count(*) from public.operation_entries
        where account_id = any(gino_account_ids)) <> 5
  then raise exception 'Gino day evidence changed'; end if;

  update public.ninja_account_links
  set completed_trade_days = 0
  where connector_id in (david_connector_id, gino_connector_id)
    and account_id = any(david_account_ids || gino_account_ids)
    and closed_at is null;

  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values (
    admin_id, 'periods', target_period_id,
    'lorena_identity_trade_baselines_corrected',
    jsonb_build_object(
      'backup_schema', 'private_lorena_identity_day_fix_20261104',
      'david_accounts', 5, 'david_recorded_trades', 2,
      'gino_accounts', 5, 'gino_recorded_trades', 1,
      'completed_trade_days', 0
    ),
    'Evita el doble cómputo entre el avance previo al registro y las operaciones contables recuperadas'
  );
end;
$repair$;

commit;
