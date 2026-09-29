-- La misma operación broker puede llegar con unos segundos de diferencia entre conectores.
-- Se amplía la ventana conservadora de deduplicación a cinco segundos.

create function public.upsert_nodal_deduplicated_operation_batch_v2(
  target_connector_id uuid,
  target_broker_session_id bigint,
  target_status text,
  target_broker_result_cents bigint,
  target_distributed_cents bigint,
  target_rounding_difference_cents bigint,
  target_opened_at timestamptz,
  target_settled_at timestamptz,
  target_accounting_status text,
  target_accounting_blocking_reason text,
  target_accounting_period_id uuid,
  target_accounting_company_id uuid,
  target_accounting_phase public.operation_phase,
  target_operated_on date,
  target_proposed_prop_count integer,
  target_context_prop_count integer
)
returns table(batch_id uuid, accepted boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_session public.ninja_operation_probe_sessions%rowtype;
  owner_id uuid;
  current_batch public.ninja_operation_batches%rowtype;
  has_current_batch boolean := false;
  duplicate_batch_id uuid;
  duplicate_session_id bigint;
  duplicate_accounting_status text;
  duplicate_prop_count integer := 0;
  duplicate_context_prop_count integer := 0;
  ignored_snapshot jsonb := '[]'::jsonb;
  stored_batch_id uuid;
begin
  if target_proposed_prop_count is null or target_proposed_prop_count < 0
    or target_context_prop_count is null or target_context_prop_count < 0 then
    raise exception 'Invalid broker context count';
  end if;

  select sessions.* into selected_session
  from public.ninja_operation_probe_sessions sessions
  where sessions.id = target_broker_session_id
    and sessions.connector_id = target_connector_id
    and sessions.status = 'closed'
    and sessions.excluded_at is null
  for update;
  if not found then raise exception 'Broker session is not available'; end if;

  select connectors.owner_user_id into owner_id
  from public.ninja_connectors connectors
  where connectors.id = target_connector_id;
  if owner_id is null then raise exception 'Connector owner is not available'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_id::text || pg_catalog.chr(31) || selected_session.account_name, 0)
  );

  select batches.* into current_batch
  from public.ninja_operation_batches batches
  where batches.connector_id = target_connector_id
    and batches.broker_session_id = target_broker_session_id
  for update;
  has_current_batch := found;

  select
    batches.id,
    sessions.id,
    batches.accounting_status,
    count(members.session_id) filter (where members.role = 'prop')::integer,
    batches.context_prop_count
  into
    duplicate_batch_id,
    duplicate_session_id,
    duplicate_accounting_status,
    duplicate_prop_count,
    duplicate_context_prop_count
  from public.ninja_operation_batches batches
  join public.ninja_operation_probe_sessions sessions on sessions.id = batches.broker_session_id
  join public.ninja_connectors connectors on connectors.id = sessions.connector_id
  left join public.ninja_operation_batch_members members on members.batch_id = batches.id
  where connectors.owner_user_id = owner_id
    and sessions.id <> selected_session.id
    and sessions.excluded_at is null
    and sessions.status = 'closed'
    and sessions.account_name = selected_session.account_name
    and pg_catalog.abs(extract(epoch from (sessions.opened_at - selected_session.opened_at))) <= 5
    and sessions.direction is not distinct from selected_session.direction
    and sessions.quantity = selected_session.quantity
    and sessions.instruments = selected_session.instruments
    and pg_catalog.round(sessions.result * 100)::bigint
      is not distinct from pg_catalog.round(selected_session.result * 100)::bigint
  group by batches.id, sessions.id
  order by
    (batches.accounting_status = 'committed') desc,
    batches.context_prop_count desc,
    count(members.session_id) filter (where members.role = 'prop') desc,
    batches.created_at
  limit 1;

  if has_current_batch and current_batch.accounting_status = 'committed'
    and duplicate_batch_id is not null and duplicate_accounting_status = 'committed' then
    raise exception 'duplicate_broker_committed_conflict';
  end if;

  if duplicate_batch_id is not null
    and not (has_current_batch and current_batch.accounting_status = 'committed')
    and (
      duplicate_accounting_status = 'committed'
      or duplicate_context_prop_count > target_context_prop_count
      or (
        duplicate_context_prop_count = target_context_prop_count
        and duplicate_prop_count >= target_proposed_prop_count
      )
    ) then
    update public.ninja_operation_probe_sessions sessions
    set excluded_at = now(), excluded_by = owner_id,
      exclusion_reason = 'Observación broker duplicada recibida desde otro conector'
    where sessions.id = selected_session.id and sessions.excluded_at is null;

    if has_current_batch and current_batch.accounting_status <> 'committed' then
      delete from public.ninja_operation_batches where id = current_batch.id;
    end if;

    insert into public.audit_events(
      actor_user_id, entity_table, entity_id, action, current_data, reason
    ) values (
      owner_id, 'ninja_operation_batches', duplicate_batch_id,
      'duplicate_broker_observation_ignored',
      jsonb_build_object(
        'kept_session_id', duplicate_session_id,
        'ignored_session_id', selected_session.id,
        'broker_account', selected_session.account_name,
        'opened_at', selected_session.opened_at
      ),
      'La misma cuenta broker y operación fueron observadas por más de un conector'
    );

    return query select duplicate_batch_id, false;
    return;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'session_id', sessions.id,
    'connector_id', sessions.connector_id,
    'batch_id', batches.id
  ) order by sessions.id), '[]'::jsonb)
  into ignored_snapshot
  from public.ninja_operation_probe_sessions sessions
  join public.ninja_connectors connectors on connectors.id = sessions.connector_id
  left join public.ninja_operation_batches batches on batches.broker_session_id = sessions.id
  where connectors.owner_user_id = owner_id
    and sessions.id <> selected_session.id
    and sessions.excluded_at is null
    and sessions.status = 'closed'
    and sessions.account_name = selected_session.account_name
    and pg_catalog.abs(extract(epoch from (sessions.opened_at - selected_session.opened_at))) <= 5
    and sessions.direction is not distinct from selected_session.direction
    and sessions.quantity = selected_session.quantity
    and sessions.instruments = selected_session.instruments
    and pg_catalog.round(sessions.result * 100)::bigint
      is not distinct from pg_catalog.round(selected_session.result * 100)::bigint
    and not exists (
      select 1 from public.ninja_operation_batches committed
      where committed.broker_session_id = sessions.id
        and committed.accounting_status = 'committed'
    );

  update public.ninja_operation_probe_sessions sessions
  set excluded_at = now(), excluded_by = owner_id,
    exclusion_reason = 'Observación broker duplicada recibida desde otro conector'
  where sessions.id in (
    select duplicates.id
    from public.ninja_operation_probe_sessions duplicates
    join public.ninja_connectors connectors on connectors.id = duplicates.connector_id
    where connectors.owner_user_id = owner_id
      and duplicates.id <> selected_session.id
      and duplicates.excluded_at is null
      and duplicates.status = 'closed'
      and duplicates.account_name = selected_session.account_name
      and pg_catalog.abs(extract(epoch from (duplicates.opened_at - selected_session.opened_at))) <= 5
      and duplicates.direction is not distinct from selected_session.direction
      and duplicates.quantity = selected_session.quantity
      and duplicates.instruments = selected_session.instruments
      and pg_catalog.round(duplicates.result * 100)::bigint
        is not distinct from pg_catalog.round(selected_session.result * 100)::bigint
      and not exists (
        select 1 from public.ninja_operation_batches committed
        where committed.broker_session_id = duplicates.id
          and committed.accounting_status = 'committed'
      )
  );

  delete from public.ninja_operation_batches batches
  where batches.accounting_status <> 'committed'
    and batches.broker_session_id in (
      select (item->>'session_id')::bigint
      from jsonb_array_elements(ignored_snapshot) item
    );

  insert into public.ninja_operation_batches(
    connector_id, broker_session_id, status, broker_result_cents,
    distributed_cents, rounding_difference_cents, opened_at, settled_at,
    accounting_mode, accounting_status, accounting_blocking_reason,
    accounting_period_id, accounting_company_id, accounting_phase, operated_on,
    context_prop_count, updated_at
  ) values (
    target_connector_id, target_broker_session_id, target_status,
    target_broker_result_cents, target_distributed_cents,
    target_rounding_difference_cents, target_opened_at, target_settled_at,
    'shadow', target_accounting_status, target_accounting_blocking_reason,
    target_accounting_period_id, target_accounting_company_id,
    target_accounting_phase, target_operated_on, target_context_prop_count, now()
  )
  on conflict(connector_id, broker_session_id) do update set
    status = excluded.status,
    broker_result_cents = excluded.broker_result_cents,
    distributed_cents = excluded.distributed_cents,
    rounding_difference_cents = excluded.rounding_difference_cents,
    opened_at = excluded.opened_at,
    settled_at = excluded.settled_at,
    accounting_mode = excluded.accounting_mode,
    accounting_status = excluded.accounting_status,
    accounting_blocking_reason = excluded.accounting_blocking_reason,
    accounting_period_id = excluded.accounting_period_id,
    accounting_company_id = excluded.accounting_company_id,
    accounting_phase = excluded.accounting_phase,
    operated_on = excluded.operated_on,
    context_prop_count = excluded.context_prop_count,
    updated_at = now()
  returning id into stored_batch_id;

  if jsonb_array_length(ignored_snapshot) > 0 then
    insert into public.audit_events(
      actor_user_id, entity_table, entity_id, action, current_data, reason
    ) values (
      owner_id, 'ninja_operation_batches', stored_batch_id,
      'duplicate_broker_observations_consolidated',
      jsonb_build_object(
        'kept_session_id', selected_session.id,
        'ignored_observations', ignored_snapshot,
        'broker_account', selected_session.account_name,
        'opened_at', selected_session.opened_at
      ),
      'La misma cuenta broker y operación fueron observadas por más de un conector'
    );
  end if;

  return query select stored_batch_id, true;
end;
$$;

revoke all on function public.upsert_nodal_deduplicated_operation_batch_v2(
  uuid,bigint,text,bigint,bigint,bigint,timestamptz,timestamptz,text,text,
  uuid,uuid,public.operation_phase,date,integer,integer
) from public, anon, authenticated;
grant execute on function public.upsert_nodal_deduplicated_operation_batch_v2(
  uuid,bigint,text,bigint,bigint,bigint,timestamptz,timestamptz,text,text,
  uuid,uuid,public.operation_phase,date,integer,integer
) to service_role;

comment on function public.upsert_nodal_deduplicated_operation_batch_v2(
  uuid,bigint,text,bigint,bigint,bigint,timestamptz,timestamptz,text,text,
  uuid,uuid,public.operation_phase,date,integer,integer
) is 'Consolida observaciones de una misma operación broker entre conectores del mismo titular antes de persistir la cobertura.';
