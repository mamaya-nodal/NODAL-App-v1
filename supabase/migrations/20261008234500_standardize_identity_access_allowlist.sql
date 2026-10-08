-- APP-174: lista inicial cerrada de personas con Identidades habilitadas.
-- Las altas posteriores comienzan deshabilitadas por APP-172/APP-173 y sólo
-- Admin o Admin Master pueden conceder la capacidad desde sus paneles.

with affected as (
  select
    users.id as user_id,
    latest_terms.desk_id
  from public.nodal_users users
  left join lateral (
    select terms.desk_id
    from public.nodal_user_terms terms
    where terms.user_id = users.id
    order by terms.effective_month desc
    limit 1
  ) latest_terms on true
  where users.identities_enabled
    and users.id <> all(array[
      'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid, -- Mauricio (cuenta personal)
      'e70a9f26-86ce-42b6-b62c-827c63981254'::uuid, -- Ivo
      '448eafd0-8158-401a-91fc-5819391b5f4e'::uuid, -- Alfred / SB Digitalmarkets
      '0c90d147-a048-48c9-8f89-e095bbadc249'::uuid  -- Julián
    ])
), changed as (
  update public.nodal_users users
  set identities_enabled = false,
      updated_at = now()
  from affected
  where users.id = affected.user_id
  returning users.id
)
insert into public.nodal_management_history(
  user_id, desk_id, actor_id, effective_month, action, before_data, after_data
)
select
  affected.user_id,
  affected.desk_id,
  'f2f5f816-ec4f-46e1-b216-5267aeadc635'::uuid,
  date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date,
  'identities_access_standardized_by_policy',
  jsonb_build_object('identities_enabled', true),
  jsonb_build_object(
    'identities_enabled', false,
    'policy', 'only Mauricio, Ivo, Alfred and Julian retain initial access'
  )
from affected
join changed on changed.id = affected.user_id;
