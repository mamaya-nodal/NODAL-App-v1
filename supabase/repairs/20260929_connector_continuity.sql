-- Scoped incident repair, not a general migration. Run once with BEGIN/ROLLBACK
-- first, inspect the result, then BEGIN/COMMIT. No deletes or economic writes.
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $repair$
declare
  old_id uuid := 'e721d96b-79b8-4504-9d7e-a15ca6651159';
  new_id uuid := '4f72f0d2-c11f-4d26-85f7-4116f656c94a';
  old_connector public.ninja_connectors%rowtype;
  new_connector public.ninja_connectors%rowtype;
  old_state jsonb;
  new_state jsonb;
  links_before jsonb;
  accounts_before jsonb;
  moved jsonb := '{}'::jsonb;
  ids jsonb;
begin
  select * into strict old_connector from public.ninja_connectors where id=old_id for update;
  select * into strict new_connector from public.ninja_connectors where id=new_id for update;
  if old_connector.owner_user_id<>new_connector.owner_user_id
    or old_connector.identity_id is distinct from new_connector.identity_id
    or old_connector.status<>'revoked' or new_connector.status<>'active'
  then raise exception 'Connector scope or status changed; stop repair'; end if;
  if exists(select 1 from public.audit_events where entity_id=new_id and action='ninja_connector_continuity_restored')
  then return; end if;
  if exists(select 1 from public.ninja_account_links where connector_id=new_id)
  then raise exception 'New connector already has registrations; manual conflict review required'; end if;
  if exists(select 1 from public.ninja_operation_probe_sessions a join public.ninja_operation_probe_sessions b
    on a.opening_event_id=b.opening_event_id where a.connector_id=old_id and b.connector_id=new_id)
  then raise exception 'Overlapping operation openings; stop repair'; end if;

  select state into strict old_state from public.ninja_transition_states where connector_id=old_id for update;
  select state into strict new_state from public.ninja_transition_states where connector_id=new_id for update;
  if (select jsonb_agg(x->'tracked'->>'externalAccountName' order by x->'tracked'->>'externalAccountName') from jsonb_array_elements(old_state->'lives') x)
    is distinct from
    (select jsonb_agg(x->'tracked'->>'externalAccountName' order by x->'tracked'->>'externalAccountName') from jsonb_array_elements(new_state->'lives') x)
  then raise exception 'Different account lives; stop automatic incident repair'; end if;
  select jsonb_agg(to_jsonb(l) order by l.id) into links_before from public.ninja_account_links l where l.connector_id=old_id;
  if jsonb_array_length(coalesce(links_before,'[]'))<>8 then raise exception 'Unexpected link count'; end if;
  select jsonb_agg(to_jsonb(a) order by a.id) into accounts_before from public.accounts a
  where a.id in(select account_id from public.ninja_account_links where connector_id=old_id);

  update public.ninja_account_links set connector_id=new_id where connector_id=old_id;
  with changed as(update public.ninja_operation_probe_sessions set connector_id=new_id where connector_id=old_id returning id)
    select jsonb_agg(id) into ids from changed;
  moved:=moved||jsonb_build_object('sessions',coalesce(ids,'[]'));
  with changed as(update public.ninja_operation_batches set connector_id=new_id where connector_id=old_id returning id)
    select jsonb_agg(id) into ids from changed;
  moved:=moved||jsonb_build_object('batches',coalesce(ids,'[]'));
  with changed as(update public.ninja_inventory_snapshots set connector_id=new_id where connector_id=old_id returning id)
    select jsonb_agg(id) into ids from changed;
  moved:=moved||jsonb_build_object('snapshots',coalesce(ids,'[]'));
  with changed as(update public.ninja_trade_telemetry_events e set connector_id=new_id
    where e.connector_id=old_id and not exists(select 1 from public.ninja_trade_telemetry_events other where other.connector_id=new_id and other.event_id=e.event_id) returning id)
    select jsonb_agg(id) into ids from changed;
  moved:=moved||jsonb_build_object('telemetry',coalesce(ids,'[]'));
  with changed as(update public.ninja_account_change_events set connector_id=new_id where connector_id=old_id returning id)
    select jsonb_agg(id) into ids from changed;
  moved:=moved||jsonb_build_object('changes',coalesce(ids,'[]'));
  with changed as(update public.ninja_broker_balance_events set connector_id=new_id where connector_id=old_id returning id)
    select jsonb_agg(id) into ids from changed;
  moved:=moved||jsonb_build_object('broker_events',coalesce(ids,'[]'));
  update public.ninja_account_registration_exclusions set connector_id=new_id where connector_id=old_id;

  -- Keep prior isolation; do not silently re-enable a quarantined connection.
  insert into public.ninja_connector_connection_reviews(connector_id,connection_name,status,reviewed_by,reviewed_at)
  select new_id,connection_name,status,reviewed_by,reviewed_at from public.ninja_connector_connection_reviews where connector_id=old_id
  on conflict(connector_id,connection_name) do update set status='isolated'
    where excluded.status='isolated';

  -- The ordinary transition engine will apply the current snapshot to the
  -- preserved life IDs/EOD/floors. Archive both states; never start at zero.
  update public.ninja_transition_states set state=old_state,revision=revision+1,updated_at=now() where connector_id=new_id;
  if accounts_before is distinct from(select jsonb_agg(to_jsonb(a) order by a.id) from public.accounts a
    where a.id in(select account_id from public.ninja_account_links where connector_id=new_id))
  then raise exception 'Economic account data changed'; end if;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,previous_data,current_data,reason)
  values(new_connector.owner_user_id,'ninja_connectors',new_id,'ninja_connector_continuity_restored',
    jsonb_build_object('old_connector_id',old_id,'links',links_before,'old_state',old_state,'new_state',new_state),
    jsonb_build_object('new_connector_id',new_id,'moved_row_ids',moved,'economic_data_unchanged',true),
    'Reparacion autorizada de fragmentacion por revinculacion. Sin borrar datos ni modificar compras, asientos o importes.');
end;
$repair$;
select 'PASS: 8 links restored; historical and new operations retained; account records unchanged' as repair,
  count(*) as links from public.ninja_account_links where connector_id='4f72f0d2-c11f-4d26-85f7-4116f656c94a';
