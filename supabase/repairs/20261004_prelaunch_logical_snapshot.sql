-- Copia logica previa al corte inicial de alumnos.
-- No modifica public ni auth. El esquema privado no se expone por la Data API.
begin;

select pg_advisory_xact_lock(hashtextextended('nodal-prelaunch-20261004', 0));

do $$
begin
  if exists (
    select 1 from pg_namespace where nspname = 'private_prelaunch_20261004'
  ) then
    raise exception 'PRELAUNCH_SNAPSHOT_ALREADY_EXISTS';
  end if;
end;
$$;

create schema private_prelaunch_20261004 authorization postgres;

revoke all on schema private_prelaunch_20261004
from public, anon, authenticated, service_role;

create table private_prelaunch_20261004.snapshot_metadata (
  snapshot_key text primary key,
  captured_at timestamptz not null default now(),
  source_project_ref text not null,
  source_revision text not null,
  reason text not null
);

create table private_prelaunch_20261004.table_manifest (
  table_name text primary key,
  source_rows bigint not null,
  copied_rows bigint not null,
  verified_at timestamptz not null default now(),
  check (source_rows = copied_rows)
);

insert into private_prelaunch_20261004.snapshot_metadata(
  snapshot_key, source_project_ref, source_revision, reason
) values (
  'prelaunch-20261004',
  'bluxgbxpepnfnjczwjgh',
  'f4e46a7',
  'Respaldo logico anterior al reinicio selectivo de datos de prueba'
);

do $$
declare
  source_table record;
  source_count bigint;
  copied_count bigint;
begin
  for source_table in
    select tables.table_name
    from information_schema.tables as tables
    where tables.table_schema = 'public'
      and tables.table_type = 'BASE TABLE'
    order by tables.table_name
  loop
    execute format(
      'create table private_prelaunch_20261004.%I as table public.%I',
      source_table.table_name,
      source_table.table_name
    );
    execute format(
      'select count(*) from public.%I', source_table.table_name
    ) into source_count;
    execute format(
      'select count(*) from private_prelaunch_20261004.%I',
      source_table.table_name
    ) into copied_count;

    if source_count is distinct from copied_count then
      raise exception 'SNAPSHOT_ROW_COUNT_MISMATCH: %', source_table.table_name;
    end if;

    insert into private_prelaunch_20261004.table_manifest(
      table_name, source_rows, copied_rows
    ) values (
      source_table.table_name, source_count, copied_count
    );
  end loop;
end;
$$;

revoke all on all tables in schema private_prelaunch_20261004
from public, anon, authenticated, service_role;

commit;

select
  count(*) as copied_tables,
  sum(source_rows) as copied_rows,
  bool_and(source_rows = copied_rows) as all_row_counts_match
from private_prelaunch_20261004.table_manifest;
