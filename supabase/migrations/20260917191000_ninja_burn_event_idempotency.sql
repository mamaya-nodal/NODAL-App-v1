-- La misma sesión técnica puede volver a procesarse mientras el conector sigue
-- enviando telemetría. Rechazar una quema ya registrada hace que toda la
-- transacción de estado se revierta y evita volver a cerrar una cuenta reparada.

create or replace function public.reject_replayed_ninja_burn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type = 'burned' and exists (
    select 1
    from public.ninja_account_change_events events
    where events.connector_id = new.connector_id
      and events.source_event_id = new.source_event_id
      and events.event_type = 'burned'
      and events.from_life_id is not distinct from new.from_life_id
  ) then
    raise exception 'Ninja burn evidence was already processed';
  end if;
  return new;
end;
$$;

create trigger ninja_account_change_events_reject_replayed_burn
before insert on public.ninja_account_change_events
for each row execute function public.reject_replayed_ninja_burn();

revoke all on function public.reject_replayed_ninja_burn()
from public, anon, authenticated;
