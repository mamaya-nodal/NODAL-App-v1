-- Narrow authenticated context; connector credentials are deliberately never selected.
create function public.get_nodalito_repair_context() returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); spaces uuid[]; periods_ids uuid[];
begin
  if owner_id is null or not exists(select 1 from public.nodal_users where id=owner_id and access_state='active') or not exists(select 1 from public.nodalito_repair_access where user_id=owner_id and enabled) then raise exception 'NODALITO_SCOPE_FORBIDDEN'; end if;
  select array_agg(id) into spaces from public.workspaces where owner_user_id=owner_id and modality='real';
  select array_agg(id) into periods_ids from public.periods where workspace_id=any(spaces) and lifecycle_status='open';
  return jsonb_build_object(
    'incomplete',(select count(*)>500 from public.accounts where workspace_id=any(spaces)) or (select count(*)>500 from public.daily_controls where period_id=any(periods_ids)),
    'periods',(select coalesce(jsonb_agg(x),'[]') from (select id,period_month,lifecycle_status from public.periods where id=any(periods_ids)) x),
    'accounts',(select coalesce(jsonb_agg(x),'[]') from (select a.id,a.reference_number,a.state,a.period_id,a.company_id,
      (select coalesce(jsonb_agg(jsonb_build_object('external_account_name',l.external_account_name,'connection_name',l.connection_name,'accounting_phase',l.accounting_phase,'completed_trade_days',l.completed_trade_days,'closed_at',l.closed_at)),'[]') from public.ninja_account_links l where l.account_id=a.id) as links
      from public.accounts a where a.workspace_id=any(spaces) order by a.created_at desc,a.id limit 500) x),
    'purchases',(select coalesce(jsonb_agg(x),'[]') from (select id,account_id,price_cents,funds_origin,wallet_id,purchased_on from public.purchases where period_id=any(periods_ids) order by purchased_on desc,id limit 500) x),
    'wallets',(select coalesce(jsonb_agg(x),'[]') from (select id,name,public.calculate_nodal_wallet_balance(id) balance_cents from public.nodal_wallets where workspace_id=any(spaces) and is_active) x),
    'payouts',(select coalesce(jsonb_agg(x),'[]') from (select f.id,f.account_id,f.amount_cents,f.approved_on,f.collected_on,f.phase from public.funding_withdrawals f join public.accounts a on a.id=f.account_id where a.workspace_id=any(spaces) and f.is_active order by f.approved_on desc,f.id limit 500) x),
    'controls',(select coalesce(jsonb_agg(x),'[]') from (select id,period_id,control_number,operated_on,phase,balance_before_cents,balance_after_cents,operating_result_cents from public.daily_controls where period_id=any(periods_ids) order by control_number desc,id limit 500) x),
    'identities',(select coalesce(jsonb_agg(x),'[]') from (select id,first_name,last_name from public.nodal_identities where workspace_id=any(spaces)) x),
    'assignments',(select coalesce(jsonb_agg(x),'[]') from (select identity_id,account_id from public.identity_account_assignments where workspace_id=any(spaces) and unassigned_at is null) x),
    'openings',(select coalesce(jsonb_agg(x),'[]') from (select period_id,broker_balance_cents,cutover_date,start_mode from public.period_opening_snapshots where period_id=any(periods_ids)) x),
    'companies',(select coalesce(jsonb_agg(x),'[]') from (select id,display_name from public.companies where is_active) x),
    'connectors',(select coalesce(jsonb_agg(x),'[]') from (select id,identity_id,connector_version,last_seen_at,status from public.ninja_connectors where owner_user_id=owner_id) x),
    'operations',(select coalesce(jsonb_agg(x),'[]') from (select b.id,b.connector_id,b.status,b.accounting_status,b.broker_result_cents,b.opened_at,b.daily_control_id from public.ninja_operation_batches b join public.ninja_connectors c on c.id=b.connector_id where c.owner_user_id=owner_id and b.accounting_period_id=any(periods_ids) order by b.opened_at desc,b.id limit 500) x),
    'brokerEvents',(select coalesce(jsonb_agg(x),'[]') from (select e.id,e.connector_id,e.observed_at,e.balance_cents,e.status,e.daily_control_id from public.ninja_broker_balance_events e join public.ninja_connectors c on c.id=e.connector_id where c.owner_user_id=owner_id and e.status='pending' order by e.observed_at desc,e.id limit 500) x),
    'inventories',(select coalesce(jsonb_agg(x),'[]') from (select distinct on(s.connector_id) s.connector_id,s.observed_at,s.accounts from public.ninja_inventory_snapshots s join public.ninja_connectors c on c.id=s.connector_id where c.owner_user_id=owner_id order by s.connector_id,s.observed_at desc,s.id) x)
  );
end $$;
revoke all on function public.get_nodalito_repair_context() from public,anon;
grant execute on function public.get_nodalito_repair_context() to authenticated;
