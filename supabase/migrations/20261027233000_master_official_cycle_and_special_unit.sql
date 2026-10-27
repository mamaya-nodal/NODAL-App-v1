-- Admin Master starts its official reporting at the approved 2026-10 reset.
-- The Special unit remains manageable, but never contributes to consolidated KPIs.

alter table public.nodal_units
  add column if not exists included_in_master_reporting boolean not null default true;

comment on column public.nodal_units.included_in_master_reporting is
  'False isolates the unit from Admin Master KPIs, history and rankings without changing personal accounting.';

-- The original function has search_path='', so named constraints cannot be
-- resolved by SET CONSTRAINTS. ALL preserves the intended deferred transaction.
do $$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.admin_save_nodal_unit(uuid,text,text,text,text,integer,date,text)'::regprocedure
  ) into definition;
  if definition is null then raise exception 'ADMIN_SAVE_NODAL_UNIT_NOT_FOUND'; end if;
  definition := replace(
    definition,
    'SET CONSTRAINTS nodal_units_root_desk_id_fkey, nodal_desks_unit_id_fkey DEFERRED',
    'SET CONSTRAINTS ALL DEFERRED'
  );
  definition := replace(
    definition,
    'set constraints nodal_units_root_desk_id_fkey, nodal_desks_unit_id_fkey deferred',
    'set constraints all deferred'
  );
  if position('nodal_units_root_desk_id_fkey, nodal_desks_unit_id_fkey' in definition) > 0 then
    raise exception 'ADMIN_SAVE_NODAL_UNIT_PATCH_FAILED';
  end if;
  execute definition;
end;
$$;

do $$
declare
  special_unit uuid := '6ec061fb-c18d-44cf-9c05-f2ced3435151';
  special_root uuid := 'e412a6fd-25cc-46cb-bac1-552af4a66b28';
  official_month constant date := '2026-10-01';
  admin_actor uuid;
  target_user record;
  previous_terms jsonb;
  resulting_terms jsonb;
begin
  select id into admin_actor
  from public.nodal_users
  where lower(email) = 'mauriciosebastianamaya@gmail.com'
  order by created_at desc
  limit 1;

  set constraints all deferred;

  if not exists(select 1 from public.nodal_units where code = 'ES') then
    insert into public.nodal_units(
      id, ordinal, name, code, root_desk_id, responsible_name,
      responsible_email, agreement_bps, included_in_master_reporting
    ) values (
      special_unit,
      (select coalesce(max(ordinal), 0) + 1 from public.nodal_units),
      'Unidad Especial', 'ES', special_root, 'Alfred',
      'mauriciosebastianamaya@gmail.com', 0, false
    );
    insert into public.nodal_desks(id, name, parent_id, unit_id, display_code)
    values(special_root, 'Mesa principal Especial', null, special_unit, 'MP');
    insert into public.nodal_desk_terms(desk_id, effective_month, manager_id, nodal_bps, active)
    values(special_root, official_month, null, 0, true);
    if admin_actor is not null then
      insert into public.nodal_management_history(
        desk_id, actor_id, effective_month, action, before_data, after_data
      ) values (
        special_root, admin_actor, official_month, 'unit_created', null,
        jsonb_build_object(
          'id', special_unit,
          'name', 'Unidad Especial',
          'code', 'ES',
          'root_desk_id', special_root,
          'included_in_master_reporting', false,
          'reason', 'Unidad aislada del consolidado Admin Master'
        )
      );
    end if;
  else
    select id, root_desk_id into special_unit, special_root
    from public.nodal_units where code = 'ES';
    update public.nodal_units
    set included_in_master_reporting = false,
        agreement_bps = 0
    where id = special_unit;
  end if;

  for target_user in
    select users.id
    from public.nodal_users users
    where lower(users.email) in ('sbdigitalmarkets@gmail.com', 'sebastianftrs@gmail.com')
  loop
    select to_jsonb(terms) into previous_terms
    from public.nodal_user_terms terms
    where terms.user_id = target_user.id
      and terms.effective_month <= official_month
    order by terms.effective_month desc
    limit 1;

    insert into public.nodal_user_terms(
      user_id, effective_month, desk_id, level, state, commission_bps, bonus_enabled
    ) values (
      target_user.id,
      official_month,
      special_root,
      coalesce((previous_terms->>'level')::integer, 1),
      coalesce(previous_terms->>'state', 'active'),
      coalesce((previous_terms->>'commission_bps')::integer, 0),
      coalesce((previous_terms->>'bonus_enabled')::boolean, false)
    )
    on conflict(user_id, effective_month) do update
      set desk_id = excluded.desk_id,
          level = excluded.level,
          state = excluded.state,
          commission_bps = excluded.commission_bps,
          bonus_enabled = excluded.bonus_enabled;

    select to_jsonb(terms) into resulting_terms
    from public.nodal_user_terms terms
    where terms.user_id = target_user.id
      and terms.effective_month = official_month;

    if admin_actor is not null and previous_terms is distinct from resulting_terms then
      insert into public.nodal_management_history(
        user_id, desk_id, actor_id, effective_month, action, before_data, after_data
      ) values (
        target_user.id, special_root, admin_actor, official_month,
        'user_moved_to_reporting_isolation', previous_terms, resulting_terms
      );
    end if;
  end loop;
end;
$$;
