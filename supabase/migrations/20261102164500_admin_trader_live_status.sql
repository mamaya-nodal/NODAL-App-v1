-- Presencia breve de la aplicación web. Sólo informa que la sesión NODAL está
-- visible; no crea registros económicos ni modifica la telemetría de Ninja.

alter table public.nodal_users
  add column if not exists last_app_seen_at timestamptz;

comment on column public.nodal_users.last_app_seen_at is
  'Último pulso recibido desde una sesión web visible de NODAL.';
