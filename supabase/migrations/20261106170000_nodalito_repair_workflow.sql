-- Common repair journal. Kept disabled in the app until integration QA passes.
create table public.nodalito_repair_access (
  user_id uuid primary key references public.nodal_users(id),
  enabled boolean not null default false
);
alter table public.nodalito_repair_access enable row level security;
revoke all on public.nodalito_repair_access from public,anon,authenticated;
create table public.nodalito_repair_plans (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.nodal_users(id),
  period_id uuid not null references public.periods(id),
  action text not null check (action in ('purchase_origin','approve_payout','collect_payout','wallet_movement','broker_transfer','coverage_members','correct_balance','register_account','recover_operation','account_progress','account_state','retry_reconciliation')),
  parameters jsonb not null,
  fingerprint text not null,
  status text not null default 'ready' check (status in ('ready','applied','reverted','needs_review')),
  receipt jsonb,
  case_id uuid references public.nodal_agent_cases(id),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  expires_at timestamptz not null default now() + interval '15 minutes'
);
alter table public.nodalito_repair_plans enable row level security;
revoke all on public.nodalito_repair_plans from public, anon, authenticated;

create or replace function public.nodalito_repair_snapshot(target_period uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare workspace uuid; result jsonb;
begin
  select p.workspace_id into workspace from public.periods p
  join public.workspaces w on w.id=p.workspace_id
  join public.nodal_users u on u.id=w.owner_user_id
  where p.id=target_period and (w.owner_user_id=auth.uid() or public.is_current_user_admin()) and u.access_state='active';
  if workspace is null then raise exception 'NODALITO_SCOPE_FORBIDDEN'; end if;
  select jsonb_build_object(
    'periods', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.periods p where p.workspace_id=workspace),
    'accounts', (select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') from public.accounts a where a.workspace_id=workspace),
    'purchases', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.purchases x join public.periods p on p.id=x.period_id where p.workspace_id=workspace),
    'controls', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.daily_controls x join public.periods p on p.id=x.period_id where p.workspace_id=workspace),
    'entries', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.operation_entries x join public.accounts a on a.id=x.account_id where a.workspace_id=workspace),
    'payouts', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.funding_withdrawals x join public.accounts a on a.id=x.account_id where a.workspace_id=workspace),
    'wallets', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.nodal_wallets x where x.workspace_id=workspace),
    'participants', (select coalesce(jsonb_agg(to_jsonb(x) order by x.daily_control_id,x.account_id),'[]') from public.daily_control_participants x join public.periods p on p.id=x.period_id where p.workspace_id=workspace),
    'links', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.ninja_account_links x join public.accounts a on a.id=x.account_id where a.workspace_id=workspace),
    'assignments', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.identity_account_assignments x where x.workspace_id=workspace),
    'opening', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.period_opening_snapshots x join public.periods p on p.id=x.period_id where p.workspace_id=workspace),
    'opening_wallets', (select coalesce(jsonb_agg(to_jsonb(x) order by x.opening_snapshot_id,x.wallet_id),'[]') from public.period_opening_wallets x join public.period_opening_snapshots s on s.id=x.opening_snapshot_id join public.periods p on p.id=s.period_id where p.workspace_id=workspace),
    'phase_withdrawals', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.account_phase_withdrawals x join public.accounts a on a.id=x.account_id where a.workspace_id=workspace),
    'ownership', (select coalesce(jsonb_agg(to_jsonb(x) order by x.physical_connector_id,x.connection_name,x.account_name),'[]') from public.ninja_account_ownership x join public.workspaces w on w.owner_user_id=x.owner_user_id where w.id=workspace),
    'batches', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.ninja_operation_batches x join public.ninja_connectors c on c.id=x.connector_id join public.workspaces w on w.owner_user_id=c.owner_user_id where w.id=workspace),
    'batch_members', (select coalesce(jsonb_agg(to_jsonb(x) order by x.batch_id,x.session_id),'[]') from public.ninja_operation_batch_members x join public.ninja_operation_batches b on b.id=x.batch_id join public.ninja_connectors c on c.id=b.connector_id join public.workspaces w on w.owner_user_id=c.owner_user_id where w.id=workspace),
    'manual_members', (select coalesce(jsonb_agg(to_jsonb(x) order by x.batch_id,x.account_id),'[]') from public.ninja_operation_batch_manual_accounts x join public.ninja_operation_batches b on b.id=x.batch_id join public.ninja_connectors c on c.id=b.connector_id join public.workspaces w on w.owner_user_id=c.owner_user_id where w.id=workspace),
    'closed_sessions', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.ninja_operation_probe_sessions x join public.ninja_connectors c on c.id=x.connector_id join public.workspaces w on w.owner_user_id=c.owner_user_id where w.id=workspace and x.status='closed'),
    'broker_events', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.ninja_broker_balance_events x join public.ninja_connectors c on c.id=x.connector_id join public.workspaces w on w.owner_user_id=c.owner_user_id where w.id=workspace),
    'movements', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.wallet_movements x join public.periods p on p.id=x.period_id where p.workspace_id=workspace)
  ) into result;
  return result;
end $$;
revoke all on function public.nodalito_repair_snapshot(uuid) from public,anon,authenticated;

create or replace function public.prepare_nodalito_repair(target_period_id uuid, target_action text, target_parameters jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb; plan_id uuid;
begin
  if not exists(select 1 from public.nodalito_repair_access where user_id=auth.uid() and enabled) then raise exception 'NODALITO_REPAIRS_DISABLED'; end if;
  snapshot := public.nodalito_repair_snapshot(target_period_id);
  if not exists(select 1 from public.periods where id=target_period_id and lifecycle_status='open') then
    raise exception 'ACCOUNTING_PERIOD_CLOSED';
  end if;
  -- A repeat request reuses the pending plan rather than producing duplicate writes.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select id into plan_id from public.nodalito_repair_plans
  where owner_user_id=auth.uid() and period_id=target_period_id and action=target_action
    and parameters=target_parameters and fingerprint=md5(snapshot::text)
    and status='ready' and expires_at>now() order by created_at desc limit 1;
  if plan_id is not null then return plan_id; end if;
  insert into public.nodalito_repair_plans(owner_user_id,period_id,action,parameters,fingerprint)
  values(auth.uid(),target_period_id,target_action,target_parameters,md5(snapshot::text)) returning id into plan_id;
  return plan_id;
end $$;

create or replace function public.apply_nodalito_repair(target_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  plan public.nodalito_repair_plans%rowtype;
  workspace uuid; p jsonb; snapshot jsonb; after_snapshot jsonb;
  result jsonb; new_case_id uuid; ids uuid[];
begin
  if auth.uid() is null then raise exception 'NODALITO_SCOPE_FORBIDDEN'; end if;
  if not exists(select 1 from public.nodalito_repair_access where user_id=auth.uid() and enabled) then raise exception 'NODALITO_REPAIRS_DISABLED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select * into plan from public.nodalito_repair_plans where id=target_plan_id and owner_user_id=auth.uid() for update;
  if not found then raise exception 'NODALITO_SCOPE_FORBIDDEN'; end if;
  if plan.status='applied' then return plan.receipt; end if;
  if plan.status<>'ready' or plan.expires_at<=now() then raise exception 'NODALITO_PLAN_EXPIRED'; end if;
  select workspace_id into workspace from public.periods where id=plan.period_id and lifecycle_status='open' for update;
  if not found then raise exception 'ACCOUNTING_PERIOD_CLOSED'; end if;
  perform 1 from public.workspaces where id=workspace and owner_user_id=auth.uid() for update;
  if not found then raise exception 'NODALITO_SCOPE_FORBIDDEN'; end if;
  snapshot:=public.nodalito_repair_snapshot(plan.period_id);
  if md5(snapshot::text)<>plan.fingerprint then raise exception 'NODALITO_SNAPSHOT_CHANGED'; end if;
  p:=plan.parameters;
  if p ? 'batch_id' and not exists(
    select 1 from public.ninja_operation_batches b join public.ninja_connectors c on c.id=b.connector_id
    where b.id=(p->>'batch_id')::uuid and c.owner_user_id=auth.uid() and c.status='active'
      and b.accounting_period_id=plan.period_id and b.daily_control_id is null
  ) then raise exception 'NODALITO_BATCH_SCOPE_OR_ALREADY_COMMITTED'; end if;
  if p ? 'event_id' and not exists(select 1 from public.ninja_broker_balance_events e join public.ninja_connectors c on c.id=e.connector_id where e.id=(p->>'event_id')::uuid and c.owner_user_id=auth.uid() and c.status='active') then raise exception 'NODALITO_SCOPE_FORBIDDEN'; end if;
  if p ? 'account_id' and not exists(select 1 from public.accounts where id=(p->>'account_id')::uuid and workspace_id=workspace) then raise exception 'NODALITO_SCOPE_FORBIDDEN'; end if;
  if nullif(p->>'wallet_id','') is not null and not exists(select 1 from public.nodal_wallets where id=(p->>'wallet_id')::uuid and workspace_id=workspace and is_active) then raise exception 'NODALITO_SCOPE_FORBIDDEN'; end if;
  case plan.action
    when 'purchase_origin' then
      if not exists(select 1 from public.purchases where account_id=(p->>'account_id')::uuid and period_id=plan.period_id and price_cents=(p->>'price_cents')::bigint) then raise exception 'NODALITO_PURCHASE_CHANGED'; end if;
      perform public.nodalito_correct_purchase_origin(plan.period_id,p);
    when 'approve_payout' then
      perform public.create_nodal_funding_withdrawal(plan.period_id,(p->>'account_id')::uuid,(p->>'approved_on')::date,(p->>'amount_cents')::bigint);
    when 'collect_payout' then
      perform public.collect_nodal_funding_withdrawal_to_wallet(plan.period_id,(p->>'withdrawal_id')::uuid,(p->>'collected_on')::date,(p->>'wallet_id')::uuid,(p->>'fee_cents')::bigint);
    when 'wallet_movement' then
      perform public.create_nodal_wallet_movement(plan.period_id,(p->>'wallet_id')::uuid,(p->>'occurred_on')::date,p->>'kind',(p->>'amount_cents')::bigint,(p->>'fee_cents')::bigint,'Corrección solicitada a Nodalito');
    when 'broker_transfer' then
      perform public.reconcile_nodal_preoperation_broker_transfer((p->>'event_id')::uuid,plan.period_id,(p->>'wallet_id')::uuid,(p->>'occurred_on')::date,p->>'kind',(p->>'fee_cents')::bigint,'Corrección solicitada a Nodalito');
    when 'coverage_members' then
      select array_agg(value::uuid) into ids from jsonb_array_elements_text(p->'account_ids');
      if ids is null or exists(select 1 from unnest(ids) id where not exists(select 1 from public.accounts a where a.id=id and a.workspace_id=workspace)) then raise exception 'NODALITO_SCOPE_FORBIDDEN'; end if;
      if exists(select 1 from unnest(ids) x(account_uuid)
        left join public.identity_account_assignments a on a.account_id=x.account_uuid and a.unassigned_at is null
        cross join public.ninja_operation_batches b join public.ninja_connectors c on c.id=b.connector_id
        where b.id=(p->>'batch_id')::uuid and a.identity_id is distinct from c.identity_id) then raise exception 'NODALITO_MIXED_IDENTITIES'; end if;
      perform public.nodalito_assign_coverage_internal((p->>'batch_id')::uuid,ids,(p->>'close_accounts')::boolean);
    when 'correct_balance' then
      perform public.nodalito_correct_balance(plan.period_id,p);
    when 'register_account' then
      perform public.create_nodal_detected_purchase_with_progress(plan.period_id,(p->>'company_id')::uuid,(p->>'price_cents')::bigint,(p->>'funds_origin')::public.purchase_funds_origin,(p->>'purchased_on')::date,(p->>'connector_id')::uuid,p->>'connection_name',p->>'external_account_name',(p->>'first_seen_at')::timestamptz,(p->>'phase')::public.operation_phase,(p->>'completed_days')::integer,nullif(p->>'wallet_id','')::uuid);
    when 'recover_operation' then
      perform public.nodalito_recover_operation(plan.period_id,p);
    when 'account_progress' then
      perform public.nodalito_correct_progress(plan.period_id,p);
    when 'account_state' then
      perform public.recalculate_nodal_account_state((p->>'account_id')::uuid);
    when 'retry_reconciliation' then
      perform public.commit_ninja_automatic_operation_batch((p->>'batch_id')::uuid);
    else raise exception 'NODALITO_ACTION_UNSUPPORTED';
  end case;
  after_snapshot:=public.nodalito_repair_snapshot(plan.period_id);
  result:=jsonb_build_object('planId',plan.id,'action',plan.action,'status','applied','appliedAt',now());
  -- A failed notice rolls back the accounting change as well.
  insert into public.nodal_agent_cases(reporter_user_id,subject_user_id,status,priority,category,title,description,evidence,resolution_note)
  values(auth.uid(),auth.uid(),'resolved','normal','nodalito_repair','Corrección realizada por Nodalito',
    'Se aplicó una corrección solicitada por el usuario: '||plan.action,
    jsonb_build_object('planId',plan.id,'parameters',p,'before',snapshot,'after',after_snapshot),
    'Aplicada; pendiente de auditoría de Admin Master') returning id into new_case_id;
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,previous_data,current_data,reason)
  values(auth.uid(),'nodalito_repair_plans',plan.id,'nodalito_repair_applied',snapshot,after_snapshot,plan.action);
  update public.nodalito_repair_plans set status='applied',receipt=result,applied_at=now(),case_id=new_case_id where id=plan.id;
  return result;
end $$;
revoke all on function public.prepare_nodalito_repair(uuid,text,jsonb) from public,anon;
revoke all on function public.apply_nodalito_repair(uuid) from public,anon;
grant execute on function public.prepare_nodalito_repair(uuid,text,jsonb) to authenticated;
grant execute on function public.apply_nodalito_repair(uuid) to authenticated;
