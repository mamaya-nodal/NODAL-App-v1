-- Real Admin Master unit creation and editing. A unit and its Main Desk are
-- one audited transaction; no partial structure may remain persisted.

drop index if exists public.nodal_desks_single_root;

alter table public.nodal_units
  add column responsible_name text,
  add column responsible_email text,
  add column agreement_bps integer;

update public.nodal_units units
set responsible_name = coalesce((
      select users.display_name
      from public.nodal_desk_terms terms
      join public.nodal_users users on users.id = terms.manager_id
      where terms.desk_id = units.root_desk_id
      order by terms.effective_month desc
      limit 1
    ), 'Responsable pendiente'),
    responsible_email = coalesce((
      select users.contact_email
      from public.nodal_desk_terms terms
      join public.nodal_users users on users.id = terms.manager_id
      where terms.desk_id = units.root_desk_id
      order by terms.effective_month desc
      limit 1
    ), (
      select users.email
      from public.nodal_desk_terms terms
      join public.nodal_users users on users.id = terms.manager_id
      where terms.desk_id = units.root_desk_id
      order by terms.effective_month desc
      limit 1
    ), 'contacto@nodaltrading.com'),
    agreement_bps = coalesce((
      select terms.nodal_bps
      from public.nodal_desk_terms terms
      where terms.desk_id = units.root_desk_id
      order by terms.effective_month desc
      limit 1
    ), 0);

alter table public.nodal_units
  alter column responsible_name set not null,
  alter column responsible_email set not null,
  alter column agreement_bps set not null,
  add constraint nodal_units_responsible_name_present check (length(btrim(responsible_name)) between 1 and 120),
  add constraint nodal_units_responsible_email_valid check (responsible_email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  add constraint nodal_units_agreement_bps_valid check (agreement_bps between 0 and 10000);

alter table public.nodal_units
  drop constraint nodal_units_root_desk_id_fkey,
  add constraint nodal_units_root_desk_id_fkey
    foreign key (root_desk_id) references public.nodal_desks(id)
    on delete restrict deferrable initially deferred;

alter table public.nodal_desks
  drop constraint nodal_desks_unit_id_fkey,
  add constraint nodal_desks_unit_id_fkey
    foreign key (unit_id) references public.nodal_units(id)
    on delete restrict deferrable initially deferred;

create or replace function public.admin_save_nodal_unit(
  target_unit_id uuid,
  target_company_name text,
  target_code text,
  target_responsible_name text,
  target_responsible_email text,
  target_agreement_bps integer,
  target_effective_month date,
  target_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  saved_unit_id uuid := target_unit_id;
  root_id uuid;
  next_ordinal integer;
  normalized_company text := btrim(regexp_replace(target_company_name, '^Unidad[[:space:]]+', '', 'i'));
  normalized_code text := upper(btrim(target_code));
  normalized_name text;
  normalized_responsible text := btrim(target_responsible_name);
  normalized_email text := lower(btrim(target_responsible_email));
  current_month date := public.nodal_accounting_period_month(now());
  previous jsonb;
  resulting jsonb;
  current_manager uuid;
  current_active boolean;
begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if target_effective_month is null or target_effective_month <> current_month then
    raise exception 'INVALID_EFFECTIVE_MONTH';
  end if;
  if length(normalized_company) < 1 or length(normalized_company) > 72 then raise exception 'INVALID_COMPANY_NAME'; end if;
  if normalized_code !~ '^[A-Z]{2}$' then raise exception 'INVALID_UNIT_CODE'; end if;
  if length(normalized_responsible) < 1 or length(normalized_responsible) > 120 then raise exception 'INVALID_RESPONSIBLE_NAME'; end if;
  if normalized_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'INVALID_RESPONSIBLE_EMAIL'; end if;
  if target_agreement_bps is null or target_agreement_bps < 0 or target_agreement_bps > 10000 then raise exception 'INVALID_AGREEMENT'; end if;
  if nullif(btrim(target_reason), '') is null then raise exception 'REASON_REQUIRED'; end if;

  normalized_name := 'Unidad ' || normalized_company;
  perform pg_advisory_xact_lock(9080702);
  set constraints nodal_units_root_desk_id_fkey, nodal_desks_unit_id_fkey deferred;

  if saved_unit_id is null then
    if exists (select 1 from public.nodal_units where code = normalized_code) then raise exception 'UNIT_CODE_EXISTS'; end if;
    saved_unit_id := extensions.gen_random_uuid();
    root_id := extensions.gen_random_uuid();
    select coalesce(max(ordinal), 0) + 1 into next_ordinal from public.nodal_units;

    insert into public.nodal_units(
      id, ordinal, name, code, root_desk_id, responsible_name, responsible_email, agreement_bps
    ) values (
      saved_unit_id, next_ordinal, normalized_name, normalized_code, root_id,
      normalized_responsible, normalized_email, target_agreement_bps
    );
    insert into public.nodal_desks(id, name, parent_id, unit_id, display_code)
    values(root_id, 'Mesa principal ' || normalized_company, null, saved_unit_id, 'MP');
    insert into public.nodal_desk_terms(desk_id, effective_month, manager_id, nodal_bps, active)
    values(root_id, target_effective_month, null, target_agreement_bps, true);

    resulting := jsonb_build_object(
      'id', saved_unit_id, 'name', normalized_name, 'code', normalized_code,
      'root_desk_id', root_id, 'responsible_name', normalized_responsible,
      'responsible_email', normalized_email, 'agreement_bps', target_agreement_bps
    );
    insert into public.nodal_management_history(desk_id, actor_id, effective_month, action, before_data, after_data)
    values(root_id, actor_id, target_effective_month, 'unit_created', null, resulting);
    return saved_unit_id;
  end if;

  select units.root_desk_id, to_jsonb(units)
  into root_id, previous
  from public.nodal_units units
  where units.id = saved_unit_id
  for update;
  if root_id is null then raise exception 'UNIT_NOT_FOUND'; end if;
  if exists (select 1 from public.nodal_units where code = normalized_code and id <> saved_unit_id) then raise exception 'UNIT_CODE_EXISTS'; end if;

  update public.nodal_units
  set name = normalized_name,
      code = normalized_code,
      responsible_name = normalized_responsible,
      responsible_email = normalized_email,
      agreement_bps = target_agreement_bps
  where id = saved_unit_id;
  update public.nodal_desks set name = 'Mesa principal ' || normalized_company where id = root_id;
  update public.nodal_user_identifiers identifiers
  set display_id = 'USER' || normalized_code || substring(display_id from 7)
  where identifiers.unit_id = saved_unit_id
    and identifiers.valid_to is null
    and identifiers.display_id !~ ('^USER' || normalized_code || '-');

  select terms.manager_id, terms.active
  into current_manager, current_active
  from public.nodal_desk_terms terms
  where terms.desk_id = root_id and terms.effective_month <= target_effective_month
  order by terms.effective_month desc
  limit 1;
  insert into public.nodal_desk_terms(desk_id, effective_month, manager_id, nodal_bps, active)
  values(root_id, target_effective_month, current_manager, target_agreement_bps, coalesce(current_active, true))
  on conflict(desk_id, effective_month) do update
  set manager_id = excluded.manager_id, nodal_bps = excluded.nodal_bps, active = excluded.active;

  select to_jsonb(units) into resulting from public.nodal_units units where units.id = saved_unit_id;
  if previous is distinct from resulting then
    insert into public.nodal_management_history(desk_id, actor_id, effective_month, action, before_data, after_data)
    values(root_id, actor_id, target_effective_month, 'unit_updated', previous, resulting);
  end if;
  return saved_unit_id;
end;
$$;

revoke all on function public.admin_save_nodal_unit(uuid,text,text,text,text,integer,date,text) from public, anon;
grant execute on function public.admin_save_nodal_unit(uuid,text,text,text,text,integer,date,text) to authenticated;

comment on function public.admin_save_nodal_unit(uuid,text,text,text,text,integer,date,text) is
  'Creates or updates a NODAL unit and its Main Desk atomically, with Admin Master authorization and audit history.';
