-- Una quema inferida por telemetría puede resultar falsa si NinjaTrader vuelve
-- a informar la misma cuenta activa, verificada y por encima del piso. En ese
-- caso se restaura el vínculo existente: no se crea una compra ni una cuenta.

create or replace function public.recover_false_ninja_burn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_link public.ninja_account_links%rowtype;
  owner_id uuid;
begin
  if not new.automatic or new.event_type <> 'burn_reversed' then return new; end if;

  select links.* into selected_link
  from public.ninja_account_links links
  where links.connector_id = new.connector_id
    and links.connection_name = new.connection_name
    and links.external_account_name = new.from_account_name
    and links.closed_at is not null
    and links.closure_reason = 'burned'
  order by links.closed_at desc
  limit 1
  for update;
  if not found then return new; end if;

  if exists (
    select 1 from public.ninja_account_links links
    where links.account_id = selected_link.account_id and links.closed_at is null
  ) then return new; end if;

  select connectors.owner_user_id into owner_id
  from public.ninja_connectors connectors
  where connectors.id = new.connector_id and connectors.status = 'active';
  if owner_id is null then return new; end if;

  update public.ninja_account_links
  set closed_at = null, closure_reason = null
  where id = selected_link.id;

  update public.accounts
  set state = 'live', state_origin = 'automatic'
  where id = selected_link.account_id;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action, current_data, reason
  ) values (
    owner_id, 'ninja_account_links', selected_link.id, 'ninja_false_burn_recovered',
    jsonb_build_object(
      'account_id', selected_link.account_id,
      'external_account_name', selected_link.external_account_name,
      'change_event_id', new.id
    ),
    new.reason
  );
  return new;
end;
$$;

drop trigger if exists ninja_account_change_events_recover_false_burn
on public.ninja_account_change_events;
create trigger ninja_account_change_events_recover_false_burn
after insert on public.ninja_account_change_events
for each row execute function public.recover_false_ninja_burn();

revoke all on function public.recover_false_ninja_burn()
from public, anon, authenticated;
