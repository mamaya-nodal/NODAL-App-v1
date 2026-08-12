-- Alta transaccional de una compra y su cuenta virgen.
-- La fecha se obtiene en el servidor y no admite cargas historicas silenciosas.

create function public.create_nodal_purchase(
  target_period_id uuid,
  target_company_id uuid,
  target_price_cents bigint,
  target_funds_origin public.purchase_funds_origin
)
returns table (
  purchase_id uuid,
  account_id uuid,
  purchase_number integer,
  reference_number integer,
  purchased_on date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_period_month date;
  business_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  next_purchase_number integer;
  next_reference_number integer;
  new_account_id uuid;
  new_purchase_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication is required';
  end if;

  if target_price_cents is null or target_price_cents < 0 then
    raise exception 'The purchase price must be nonnegative';
  end if;

  select periods.period_month
  into selected_period_month
  from public.periods as periods
  join public.workspaces as spaces on spaces.id = periods.workspace_id
  join public.nodal_users as users on users.id = spaces.owner_user_id
  where periods.id = target_period_id
    and spaces.owner_user_id = actor_id
    and users.access_state = 'active'
  for update of periods;

  if not found then
    raise exception 'The selected period is not available to this user';
  end if;

  if date_trunc('month', business_today)::date <> selected_period_month then
    raise exception 'Purchases can only be registered in the selected current month';
  end if;

  if not exists (
    select 1
    from public.companies as companies
    where companies.id = target_company_id
      and companies.is_active
      and (companies.valid_from is null or companies.valid_from <= business_today)
      and (companies.valid_until is null or companies.valid_until >= business_today)
  ) then
    raise exception 'The selected company is not currently available';
  end if;

  select coalesce(max(purchases.purchase_number), 0) + 1
  into next_purchase_number
  from public.purchases as purchases
  where purchases.period_id = target_period_id;

  select coalesce(max(accounts.reference_number), 0) + 1
  into next_reference_number
  from public.accounts as accounts
  where accounts.period_id = target_period_id
    and accounts.company_id = target_company_id;

  insert into public.accounts (
    period_id,
    company_id,
    reference_number,
    state,
    created_by
  )
  values (
    target_period_id,
    target_company_id,
    next_reference_number,
    'virgin',
    actor_id
  )
  returning id into new_account_id;

  insert into public.purchases (
    period_id,
    account_id,
    purchase_number,
    purchased_on,
    price_cents,
    funds_origin,
    created_by
  )
  values (
    target_period_id,
    new_account_id,
    next_purchase_number,
    business_today,
    target_price_cents,
    target_funds_origin,
    actor_id
  )
  returning id into new_purchase_id;

  insert into public.audit_events (
    actor_user_id,
    entity_table,
    entity_id,
    action,
    current_data,
    reason
  )
  values (
    actor_id,
    'purchases',
    new_purchase_id,
    'purchase_created',
    jsonb_build_object(
      'period_id', target_period_id,
      'account_id', new_account_id,
      'company_id', target_company_id,
      'purchase_number', next_purchase_number,
      'reference_number', next_reference_number,
      'purchased_on', business_today,
      'price_cents', target_price_cents,
      'funds_origin', target_funds_origin,
      'account_state', 'virgin'
    ),
    'Compra confirmada por el usuario'
  );

  return query
  select
    new_purchase_id,
    new_account_id,
    next_purchase_number,
    next_reference_number,
    business_today;
end;
$$;

revoke all on function public.create_nodal_purchase(
  uuid,
  uuid,
  bigint,
  public.purchase_funds_origin
) from public, anon;

grant execute on function public.create_nodal_purchase(
  uuid,
  uuid,
  bigint,
  public.purchase_funds_origin
) to authenticated;
