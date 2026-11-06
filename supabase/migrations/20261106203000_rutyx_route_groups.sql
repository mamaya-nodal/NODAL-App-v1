-- Permite enlazar varias cuentas de fondeo al mismo recorrido de RUTYX.

alter table public.rutyx_route_states
  add column group_id uuid;

update public.rutyx_route_states
set group_id = id
where group_id is null;

alter table public.rutyx_route_states
  alter column group_id set not null;

create index rutyx_route_states_group_idx
on public.rutyx_route_states(user_id, group_id);

comment on column public.rutyx_route_states.group_id is
  'Agrupa las cuentas de fondeo que avanzan juntas por el mismo recorrido.';
