-- Explicitly authorized test in Mauricio's personal production workspace.
-- Snapshot before admission of SIM telemetry. No real orders or fund transfers.
begin;
create schema if not exists private_mauricio_sim_20261114;
revoke all on schema private_mauricio_sim_20261114 from public, anon, authenticated;
create table if not exists private_mauricio_sim_20261114.before_rows (
  table_name text not null,
  row_hash text not null,
  row_data jsonb not null,
  captured_at timestamptz not null default now(),
  primary key(table_name, row_hash)
);
alter table private_mauricio_sim_20261114.before_rows enable row level security;
revoke all on private_mauricio_sim_20261114.before_rows from public, anon, authenticated;
do $$
declare
  anchor_ids uuid[];
  selected record;
begin
  -- Never include created_by/actor_user_id: Mauricio administers OTHER users too.
  select array_agg(id) into anchor_ids from (
    select 'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid id
    union select id from public.workspaces where owner_user_id='f2f5f816-ec4f-46e1-b216-5267aeadc635'
    union select p.id from public.periods p join public.workspaces w on w.id=p.workspace_id where w.owner_user_id='f2f5f816-ec4f-46e1-b216-5267aeadc635'
    union select id from public.ninja_connectors where owner_user_id='f2f5f816-ec4f-46e1-b216-5267aeadc635'
    union select id from public.accounts where workspace_id in (select id from public.workspaces where owner_user_id='f2f5f816-ec4f-46e1-b216-5267aeadc635')
    union select id from public.nodal_identities where workspace_id='8b1c794b-f0d0-423b-88a0-25b5ec80c0ff'
    union select id from public.nodal_wallets where workspace_id='8b1c794b-f0d0-423b-88a0-25b5ec80c0ff'
    union select c.id from public.daily_controls c join public.periods p on p.id=c.period_id join public.workspaces w on w.id=p.workspace_id where w.owner_user_id='f2f5f816-ec4f-46e1-b216-5267aeadc635'
    union select s.id from public.period_opening_snapshots s join public.periods p on p.id=s.period_id join public.workspaces w on w.id=p.workspace_id where w.owner_user_id='f2f5f816-ec4f-46e1-b216-5267aeadc635'
  ) anchors;
  for selected in
    select c.table_name, string_agg(format('t.%I = any($1)',c.column_name),' or ') as predicate
    from information_schema.columns c
    join information_schema.tables t using(table_catalog,table_schema,table_name)
    where c.table_schema='public' and t.table_type='BASE TABLE' and c.udt_name='uuid'
      and c.column_name in ('id','owner_user_id','user_id','workspace_id','period_id','connector_id',
        'physical_connector_id','destination_connector_id','identity_id','account_id','daily_control_id','opening_snapshot_id')
    group by c.table_name
  loop
    execute format('insert into private_mauricio_sim_20261114.before_rows(table_name,row_hash,row_data) select %L,md5(to_jsonb(t)::text),to_jsonb(t) from public.%I t where %s on conflict do nothing',selected.table_name,selected.table_name,selected.predicate) using anchor_ids;
  end loop;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values ('f2f5f816-ec4f-46e1-b216-5267aeadc635','workspaces','8b1c794b-f0d0-423b-88a0-25b5ec80c0ff',
    'authorized_simulation_backup_20261114',jsonb_build_object('backup_schema','private_mauricio_sim_20261114','expires_at','2026-11-16T03:00:00Z'),
    'Mauricio autoriza pruebas SIM en su contabilidad personal real y posterior limpieza; conservar Admin Master y no afectar otros usuarios');
end;
$$;
commit;
select count(*) as backed_up_rows,count(distinct table_name) as backed_up_tables,min(captured_at) as baseline_at
from private_mauricio_sim_20261114.before_rows;
