-- Conserva en el alta la fase que ya puede deducirse del identificador Ninja.
-- Una cuenta Funded/Live, o una evaluación cuyo saldo ya se movió, no nace virgen.

create or replace function public.nodal_detected_ninja_phase(target_external_account_name text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when upper(btrim(target_external_account_name)) ~ '^LMXF[0-9]+$'
      or upper(btrim(target_external_account_name)) ~ '^LFF[0-9]+$'
      or upper(btrim(target_external_account_name)) ~ '^MFFUSFREOD[A-Z0-9]+$'
      or upper(btrim(target_external_account_name)) ~ '^EXPRESS-V2-CT-[A-Z0-9-]+$'
      or upper(btrim(target_external_account_name)) ~ '^FFFUNDED[0-9]{6}$'
      or upper(btrim(target_external_account_name)) ~ '^FTDFYSLX50[A-Z0-9-]*$'
      or upper(btrim(target_external_account_name)) ~ '^TAKEPROFITPRO[A-Z0-9-]*$'
      then 'Funded'
    when upper(btrim(target_external_account_name)) ~ '^LMXL[0-9]+$'
      or upper(btrim(target_external_account_name)) ~ '^LFL[0-9]+$'
      or upper(btrim(target_external_account_name)) ~ '^TOPX[A-Z0-9-]+$'
      then 'Live'
    when upper(btrim(target_external_account_name)) ~ '^LMX[0-9]+$'
      or upper(btrim(target_external_account_name)) ~ '^LFE[0-9]+$'
      or upper(btrim(target_external_account_name)) ~ '^MFFUEVRPD[A-Z0-9]+$'
      or upper(btrim(target_external_account_name)) ~ '^50KTC-V2-[A-Z0-9-]+$'
      or upper(btrim(target_external_account_name)) ~ '^FFF[0-9]{6}$'
      or upper(btrim(target_external_account_name)) ~ '^FTMO[0-9]+$'
      or upper(btrim(target_external_account_name)) ~ '^TDFYSL25[A-Z0-9-]*$'
      or upper(btrim(target_external_account_name)) ~ '^TDFYSL50[A-Z0-9-]*$'
      or upper(btrim(target_external_account_name)) ~ '^TAKEPROFIT[A-Z0-9-]*$'
      then 'Evaluation'
    else null
  end;
$$;

create or replace function public.nodal_detected_ninja_initial_balance_cents(target_external_account_name text)
returns bigint
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when upper(btrim(target_external_account_name)) ~ '^TDFYSL25[A-Z0-9-]*$' then 2500000::bigint
    when public.nodal_detected_ninja_phase(target_external_account_name) is not null then 5000000::bigint
    else null
  end;
$$;

create or replace function public.create_nodal_detected_purchase(
  target_period_id uuid,target_company_id uuid,target_price_cents bigint,
  target_funds_origin public.purchase_funds_origin,target_purchased_on date,
  target_connector_id uuid,target_connection_name text,target_external_account_name text,
  target_first_seen_at timestamptz
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  business_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  next_purchase_number integer; next_reference_number integer;
  new_account_id uuid; new_purchase_id uuid;
  observed_account jsonb;
  observed_cash_value_cents bigint;
  detected_phase text;
  detected_initial_balance_cents bigint;
  initial_account_state public.account_state := 'virgin';
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;
  if target_price_cents is null or target_price_cents < 0 then raise exception 'Invalid purchase price'; end if;
  if target_purchased_on is null or target_purchased_on > business_today then raise exception 'Invalid purchase date'; end if;
  if target_connector_id is null or nullif(btrim(target_connection_name), '') is null
    or nullif(btrim(target_external_account_name), '') is null then raise exception 'Invalid Ninja identity'; end if;
  perform 1 from public.periods periods
  join public.workspaces spaces on spaces.id=periods.workspace_id
  join public.nodal_users users on users.id=spaces.owner_user_id
  where periods.id=target_period_id and spaces.owner_user_id=actor_id
    and users.access_state='active' and periods.lifecycle_status='open'
  for update of periods;
  if not found then raise exception 'The selected period is not available to this user'; end if;
  if not public.nodal_date_belongs_to_period(target_period_id,target_purchased_on) then
    raise exception 'Purchase date must belong to selected period';
  end if;
  if not exists(select 1 from public.ninja_connectors connectors
    where connectors.id=target_connector_id and connectors.owner_user_id=actor_id and connectors.status='active')
    then raise exception 'Connector is not active for this user'; end if;
  if exists(select 1 from public.ninja_connector_connection_reviews reviews
    where reviews.connector_id=target_connector_id and reviews.connection_name=btrim(target_connection_name)
      and reviews.status='isolated') then raise exception 'Ninja connection is isolated for this user'; end if;

  select observed.account into observed_account
  from (
    select account, snapshots.observed_at
    from public.ninja_inventory_snapshots snapshots,
      jsonb_array_elements(snapshots.accounts) account
    where snapshots.connector_id=target_connector_id
      and account->>'connectionName'=btrim(target_connection_name)
      and account->>'accountName'=btrim(target_external_account_name)
    order by snapshots.observed_at desc
    limit 1
  ) observed;
  if observed_account is null then raise exception 'Ninja account was not observed for this user'; end if;
  if exists(select 1 from public.ninja_account_links links
    where links.connector_id=target_connector_id and links.connection_name=btrim(target_connection_name)
      and links.external_account_name=btrim(target_external_account_name) and links.closed_at is null)
    then raise exception 'Ninja account already linked'; end if;
  if not exists(select 1 from public.companies where id=target_company_id and is_active)
    then raise exception 'Company is not available'; end if;

  detected_phase := public.nodal_detected_ninja_phase(target_external_account_name);
  if detected_phase is null then raise exception 'Ninja account phase is not recognized'; end if;
  detected_initial_balance_cents := public.nodal_detected_ninja_initial_balance_cents(target_external_account_name);
  if jsonb_typeof(observed_account->'cashValue')='number' then
    observed_cash_value_cents := round((observed_account->>'cashValue')::numeric * 100)::bigint;
  end if;
  if detected_phase in ('Funded','Live')
    or (detected_phase='Evaluation' and observed_cash_value_cents is not null
      and detected_initial_balance_cents is not null
      and observed_cash_value_cents<>detected_initial_balance_cents) then
    initial_account_state := 'live';
  end if;

  select coalesce(max(purchase_number),0)+1 into next_purchase_number
  from public.purchases where period_id=target_period_id;
  select coalesce(max(reference_number),0)+1 into next_reference_number
  from public.accounts where workspace_id=(select workspace_id from public.periods where id=target_period_id)
    and company_id=target_company_id;
  insert into public.accounts(period_id,company_id,reference_number,state,created_by)
  values(target_period_id,target_company_id,next_reference_number,initial_account_state,actor_id)
  returning id into new_account_id;
  insert into public.purchases(period_id,account_id,purchase_number,purchased_on,price_cents,funds_origin,created_by)
  values(target_period_id,new_account_id,next_purchase_number,target_purchased_on,target_price_cents,target_funds_origin,actor_id)
  returning id into new_purchase_id;
  insert into public.ninja_account_links(account_id,connector_id,connection_name,external_account_name,first_seen_at,linked_by,phase)
  values(new_account_id,target_connector_id,btrim(target_connection_name),btrim(target_external_account_name),target_first_seen_at,actor_id,detected_phase);
  insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
  values(actor_id,'purchases',new_purchase_id,'detected_purchase_created',jsonb_build_object(
    'account_id',new_account_id,'external_account_name',btrim(target_external_account_name),
    'connection_name',btrim(target_connection_name),'purchased_on',target_purchased_on,
    'price_cents',target_price_cents,'funds_origin',target_funds_origin,
    'detected_phase',detected_phase,'observed_cash_value_cents',observed_cash_value_cents,
    'account_state',initial_account_state
  ),'Compra detectada en Ninja y confirmada por el usuario');
  return new_purchase_id;
end;
$$;

with candidates as (
  select links.id, links.account_id,
    public.nodal_detected_ninja_phase(links.external_account_name) detected_phase
  from public.ninja_account_links links
  where links.closed_at is null and links.phase is null
), repaired as (
  update public.ninja_account_links links
  set phase=candidates.detected_phase
  from candidates
  where links.id=candidates.id and candidates.detected_phase is not null
  returning links.id, links.account_id, links.linked_by, links.phase
)
insert into public.audit_events(actor_user_id,entity_table,entity_id,action,current_data,reason)
select repaired.linked_by,'ninja_account_links',repaired.id,'detected_account_phase_repaired',
  jsonb_build_object('account_id',repaired.account_id,'phase',repaired.phase),
  'Fase inicial recuperada desde el identificador observado por Ninja'
from repaired;

with candidates as (
  select accounts.id, links.linked_by, links.phase,
    case when jsonb_typeof(observed.account->'cashValue')='number'
      then round((observed.account->>'cashValue')::numeric * 100)::bigint else null end observed_cash_value_cents,
    public.nodal_detected_ninja_initial_balance_cents(links.external_account_name) initial_balance_cents
  from public.accounts accounts
  join public.ninja_account_links links on links.account_id=accounts.id and links.closed_at is null
  left join lateral (
    select account
    from public.ninja_inventory_snapshots snapshots,
      jsonb_array_elements(snapshots.accounts) account
    where snapshots.connector_id=links.connector_id
      and account->>'connectionName'=links.connection_name
      and account->>'accountName'=links.external_account_name
    order by snapshots.observed_at desc
    limit 1
  ) observed on true
  where accounts.state='virgin' and links.phase is not null
), repaired as (
  update public.accounts accounts
  set state='live',state_origin='automatic',updated_at=now(),updated_by=candidates.linked_by
  from candidates
  where accounts.id=candidates.id and (
    candidates.phase in ('Funded','Live')
    or (candidates.phase='Evaluation' and candidates.observed_cash_value_cents is not null
      and candidates.initial_balance_cents is not null
      and candidates.observed_cash_value_cents<>candidates.initial_balance_cents)
  )
  returning accounts.id, candidates.linked_by, candidates.phase,
    candidates.observed_cash_value_cents
)
insert into public.audit_events(actor_user_id,entity_table,entity_id,action,previous_data,current_data,reason)
select repaired.linked_by,'accounts',repaired.id,'detected_account_initial_state_repaired',
  jsonb_build_object('state','virgin'),
  jsonb_build_object('state','live','phase',repaired.phase,'observed_cash_value_cents',repaired.observed_cash_value_cents),
  'La fase y el saldo Ninja demuestran que la cuenta registrada ya estaba activa'
from repaired;

revoke all on function public.nodal_detected_ninja_phase(text) from public,anon;
revoke all on function public.nodal_detected_ninja_initial_balance_cents(text) from public,anon;
grant execute on function public.nodal_detected_ninja_phase(text) to authenticated;
grant execute on function public.nodal_detected_ninja_initial_balance_cents(text) to authenticated;

