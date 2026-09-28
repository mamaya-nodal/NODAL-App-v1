-- Una cuenta quemada puede seguir visible en Ninja durante varios inventarios.
-- Su vínculo cerrado sigue representando la misma vida hasta que el motor
-- observe una desaparición y un reset verificable.

create function public.enforce_ninja_account_life_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_linked_at timestamptz;
  latest_reset_at timestamptz;
begin
  if new.connector_id is null then return new; end if;

  select max(links.linked_at) into latest_linked_at
  from public.ninja_account_links links
  where links.connector_id = new.connector_id
    and links.connection_name = new.connection_name
    and links.external_account_name = new.external_account_name;

  if latest_linked_at is null then return new; end if;

  select max(events.occurred_at) into latest_reset_at
  from public.ninja_account_change_events events
  where events.connector_id = new.connector_id
    and events.connection_name = new.connection_name
    and events.to_account_name = new.external_account_name
    and events.event_type in ('reset', 'reset_after_burn')
    and events.resolution_status in ('automatic', 'confirmed');

  if latest_reset_at is null or latest_reset_at <= latest_linked_at then
    raise exception 'Ninja account already linked for current life';
  end if;

  return new;
end;
$$;

drop trigger if exists ninja_account_links_life_registration_guard
on public.ninja_account_links;
create trigger ninja_account_links_life_registration_guard
before insert on public.ninja_account_links
for each row execute function public.enforce_ninja_account_life_registration();

revoke all on function public.enforce_ninja_account_life_registration()
from public, anon, authenticated;
