-- Una cuenta puede confirmarse después de que Ninja ya informó su quema.
-- El vínculo tardío debe heredar ese cierre en lugar de crear una cuenta virgen.

create or replace function public.apply_historical_ninja_burn_on_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  burn_event public.ninja_account_change_events%rowtype;
  owner_id uuid;
begin
  if new.connector_id is null then return new; end if;

  select events.* into burn_event
  from public.ninja_account_change_events events
  where events.connector_id = new.connector_id
    and events.connection_name = new.connection_name
    and events.from_account_name = new.external_account_name
    and events.event_type = 'burned'
    and events.automatic
    and events.occurred_at >= new.first_seen_at
  order by events.occurred_at
  limit 1;
  if not found then return new; end if;

  select connectors.owner_user_id into owner_id
  from public.ninja_connectors connectors
  where connectors.id = new.connector_id;

  update public.ninja_account_links links
  set closed_at = burn_event.occurred_at, closure_reason = 'burned'
  where links.id = new.id and links.closed_at is null;
  update public.accounts accounts
  set state = 'closed', state_origin = 'automatic'
  where accounts.id = new.account_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    owner_id, 'ninja_account_links', new.id, 'historical_ninja_burn_applied',
    jsonb_build_object(
      'account_id', new.account_id,
      'external_account_name', new.external_account_name,
      'burn_event_id', burn_event.id,
      'burned_at', burn_event.occurred_at
    ),
    'La cuenta fue registrada después de que Ninja ya había confirmado su quema.'
  );
  return new;
end;
$$;

drop trigger if exists ninja_account_links_apply_historical_burn
on public.ninja_account_links;
create trigger ninja_account_links_apply_historical_burn
after insert on public.ninja_account_links
for each row execute function public.apply_historical_ninja_burn_on_link();

-- Repara vínculos tardíos que ya existían al desplegar esta regla.
with historical_burns as (
  select distinct on (links.id)
    links.id as link_id,
    links.account_id,
    events.occurred_at
  from public.ninja_account_links links
  join public.ninja_account_change_events events
    on events.connector_id = links.connector_id
   and events.connection_name = links.connection_name
   and events.from_account_name = links.external_account_name
   and events.event_type = 'burned'
   and events.automatic
   and events.occurred_at >= links.first_seen_at
  where links.closed_at is null
  order by links.id, events.occurred_at
), closed_links as (
  update public.ninja_account_links links
  set closed_at = burns.occurred_at, closure_reason = 'burned'
  from historical_burns burns
  where links.id = burns.link_id
  returning links.account_id
)
update public.accounts accounts
set state = 'closed', state_origin = 'automatic'
where accounts.id in (select closed_links.account_id from closed_links);

revoke all on function public.apply_historical_ninja_burn_on_link()
from public, anon, authenticated;
