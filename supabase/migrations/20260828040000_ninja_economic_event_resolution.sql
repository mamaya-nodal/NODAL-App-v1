alter table public.ninja_account_links drop constraint if exists ninja_account_links_account_id_key;
alter table public.ninja_account_links
  add column if not exists phase text check (phase in ('Evaluation', 'Funded', 'Live')),
  add column if not exists life_id text,
  add column if not exists closure_reason text;

create unique index if not exists ninja_account_links_one_active_per_account
on public.ninja_account_links(account_id) where closed_at is null;

create or replace function public.normalize_ninja_change_resolution_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.event_type in ('reset', 'reset_after_burn') then new.resolution_status = 'pending'; end if;
  return new;
end;
$$;

drop trigger if exists ninja_account_change_events_normalize_resolution on public.ninja_account_change_events;
create trigger ninja_account_change_events_normalize_resolution
before insert on public.ninja_account_change_events
for each row execute function public.normalize_ninja_change_resolution_status();

create or replace function public.apply_automatic_ninja_account_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_link public.ninja_account_links%rowtype;
  owner_id uuid;
  new_link_id uuid;
begin
  if not new.automatic or new.event_type not in ('burned', 'evaluation_to_funded') then return new; end if;
  select links.* into selected_link
  from public.ninja_account_links links
  where links.connector_id = new.connector_id
    and links.connection_name = new.connection_name
    and links.external_account_name = new.from_account_name
    and links.closed_at is null
  for update;
  if not found then return new; end if;
  select connectors.owner_user_id into owner_id from public.ninja_connectors connectors where connectors.id = new.connector_id;

  update public.ninja_account_links links set closed_at = new.occurred_at,
    closure_reason = case when new.event_type = 'burned' then 'burned' else 'phase_transition' end
  where links.id = selected_link.id;

  if new.event_type = 'burned' then
    update public.accounts set state = 'closed', state_origin = 'automatic' where id = selected_link.account_id;
  else
    insert into public.ninja_account_links(
      account_id, connector_id, connection_name, external_account_name,
      first_seen_at, linked_by, phase, life_id
    ) values (
      selected_link.account_id, new.connector_id, new.connection_name,
      new.to_account_name, new.occurred_at, owner_id, 'Funded', new.to_life_id
    ) returning id into new_link_id;
  end if;

  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values(owner_id, 'ninja_account_change_events', new.id,
    case when new.event_type = 'burned' then 'ninja_burn_applied' else 'ninja_funded_transition_applied' end,
    jsonb_build_object('account_id', selected_link.account_id, 'from', new.from_account_name, 'to', new.to_account_name, 'new_link_id', new_link_id),
    new.reason);
  return new;
end;
$$;

drop trigger if exists ninja_account_change_events_apply_automatic on public.ninja_account_change_events;
create trigger ninja_account_change_events_apply_automatic
after insert on public.ninja_account_change_events
for each row execute function public.apply_automatic_ninja_account_change();

create or replace function public.resolve_ninja_account_change_event(
  target_event_id uuid,
  target_resolution text,
  management_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_event public.ninja_account_change_events%rowtype;
  selected_link public.ninja_account_links%rowtype;
begin
  if actor_id is null or nullif(btrim(management_reason), '') is null then raise exception 'Not authorized'; end if;
  select events.* into selected_event
  from public.ninja_account_change_events events
  join public.ninja_connectors connectors on connectors.id = events.connector_id
  where events.id = target_event_id and connectors.owner_user_id = actor_id
    and events.resolution_status = 'pending'
  for update of events;
  if not found then raise exception 'Event is not available'; end if;
  if target_resolution = 'dismiss' then
    update public.ninja_account_change_events set resolution_status = 'dismissed' where id = selected_event.id;
  elsif selected_event.event_type = 'funded_to_live_review' and target_resolution = 'confirm_transition' then
    select links.* into selected_link from public.ninja_account_links links
    where links.connector_id = selected_event.connector_id
      and links.connection_name = selected_event.connection_name
      and links.external_account_name = selected_event.from_account_name
      and links.closed_at is null for update;
    if not found then raise exception 'Active account link was not found'; end if;
    update public.ninja_account_links set closed_at = selected_event.occurred_at, closure_reason = 'phase_transition' where id = selected_link.id;
    insert into public.ninja_account_links(account_id, connector_id, connection_name, external_account_name, first_seen_at, linked_by, phase, life_id)
    values(selected_link.account_id, selected_event.connector_id, selected_event.connection_name, selected_event.to_account_name,
      selected_event.occurred_at, actor_id, 'Live', selected_event.to_life_id);
    update public.ninja_account_change_events set resolution_status = 'confirmed' where id = selected_event.id;
  elsif selected_event.event_type = 'review_disappearance' and target_resolution = 'confirm_closed' then
    select links.* into selected_link from public.ninja_account_links links
    where links.connector_id = selected_event.connector_id
      and links.connection_name = selected_event.connection_name
      and links.external_account_name = selected_event.from_account_name
      and links.closed_at is null for update;
    if not found then raise exception 'Active account link was not found'; end if;
    update public.ninja_account_links set closed_at = selected_event.occurred_at, closure_reason = 'user_confirmed_closed' where id = selected_link.id;
    update public.accounts set state = 'closed', state_origin = 'automatic' where id = selected_link.account_id;
    update public.ninja_account_change_events set resolution_status = 'confirmed' where id = selected_event.id;
  else raise exception 'Resolution is not valid for this event'; end if;

  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values(actor_id, 'ninja_account_change_events', selected_event.id, 'ninja_change_event_resolved',
    jsonb_build_object('resolution', target_resolution), btrim(management_reason));
  return true;
end;
$$;

create or replace function public.register_ninja_reset_purchase(
  target_event_id uuid,
  target_period_id uuid,
  target_price_cents bigint,
  target_funds_origin public.purchase_funds_origin,
  target_purchased_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_event public.ninja_account_change_events%rowtype;
  selected_link public.ninja_account_links%rowtype;
  old_account public.accounts%rowtype;
  next_purchase_number integer;
  next_reference_number integer;
  new_account_id uuid;
  new_purchase_id uuid;
begin
  if actor_id is null or target_price_cents < 0 then raise exception 'Invalid reset purchase'; end if;
  select events.* into selected_event from public.ninja_account_change_events events
  join public.ninja_connectors connectors on connectors.id = events.connector_id
  where events.id = target_event_id and connectors.owner_user_id = actor_id
    and events.event_type in ('reset', 'reset_after_burn')
    and events.resolution_status = 'pending' for update of events;
  if not found then raise exception 'Reset event is not available'; end if;
  select links.* into selected_link from public.ninja_account_links links
  where links.connector_id = selected_event.connector_id and links.connection_name = selected_event.connection_name
    and links.external_account_name = selected_event.from_account_name and links.closed_at is null for update;
  if not found then raise exception 'Active account link was not found'; end if;
  select accounts.* into old_account from public.accounts accounts
  where accounts.id = selected_link.account_id and accounts.period_id = target_period_id for update;
  if not found or date_trunc('month', target_purchased_on)::date <> (select period_month from public.periods where id = target_period_id) then
    raise exception 'Reset purchase period is invalid';
  end if;

  update public.ninja_account_links set closed_at = selected_event.occurred_at, closure_reason = selected_event.event_type where id = selected_link.id;
  update public.accounts set state = 'closed', state_origin = 'automatic' where id = old_account.id;
  select coalesce(max(purchase_number), 0) + 1 into next_purchase_number from public.purchases where period_id = target_period_id;
  select coalesce(max(reference_number), 0) + 1 into next_reference_number from public.accounts
    where period_id = target_period_id and company_id = old_account.company_id;
  insert into public.accounts(period_id, company_id, reference_number, state, created_by)
  values(target_period_id, old_account.company_id, next_reference_number, 'virgin', actor_id) returning id into new_account_id;
  insert into public.purchases(period_id, account_id, purchase_number, purchased_on, price_cents, funds_origin, created_by)
  values(target_period_id, new_account_id, next_purchase_number, target_purchased_on, target_price_cents, target_funds_origin, actor_id)
  returning id into new_purchase_id;
  insert into public.ninja_account_links(account_id, connector_id, connection_name, external_account_name, first_seen_at, linked_by, phase, life_id)
  values(new_account_id, selected_event.connector_id, selected_event.connection_name, selected_event.to_account_name,
    selected_event.occurred_at, actor_id, 'Evaluation', selected_event.to_life_id);
  update public.ninja_account_change_events set resolution_status = 'confirmed' where id = selected_event.id;
  insert into public.audit_events(actor_user_id, entity_table, entity_id, action, current_data, reason)
  values(actor_id, 'purchases', new_purchase_id, 'ninja_reset_purchase_created',
    jsonb_build_object('prior_account_id', old_account.id, 'new_account_id', new_account_id, 'event_id', selected_event.id),
    'Reset detectado por Ninja y compra completada por el usuario');
  return new_purchase_id;
end;
$$;

revoke all on function public.apply_automatic_ninja_account_change() from public, anon, authenticated;
revoke all on function public.normalize_ninja_change_resolution_status() from public, anon, authenticated;
revoke all on function public.resolve_ninja_account_change_event(uuid, text, text) from public, anon;
revoke all on function public.register_ninja_reset_purchase(uuid, uuid, bigint, public.purchase_funds_origin, date) from public, anon;
grant execute on function public.resolve_ninja_account_change_event(uuid, text, text) to authenticated;
grant execute on function public.register_ninja_reset_purchase(uuid, uuid, bigint, public.purchase_funds_origin, date) to authenticated;
