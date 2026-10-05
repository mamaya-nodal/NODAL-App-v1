-- Asignación inicial de IDs visibles a la nómina activa confirmada.
-- Ejecutado en producción el 2026-10-05. No modifica porcentajes,
-- contabilidad, espacios ni historiales económicos.

begin;

insert into public.nodal_user_identifiers(
  user_id, unit_id, desk_id, display_id, member_number, reason, assigned_by
) values
  ('e70a9f26-86ce-42b6-b62c-827c63981254', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'USERND-MP-01', 1, 'Asignación inicial de usuarios activos confirmados', 'f2f5f816-ec4f-46e1-b216-5267aeadc635'),
  ('f2f5f816-ec4f-46e1-b216-5267aeadc635', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'USERND-MP-02', 2, 'Asignación inicial de usuarios activos confirmados', 'f2f5f816-ec4f-46e1-b216-5267aeadc635'),
  ('448eafd0-8158-401a-91fc-5819391b5f4e', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'USERND-MP-03', 3, 'Asignación inicial de usuarios activos confirmados', 'f2f5f816-ec4f-46e1-b216-5267aeadc635'),
  ('ffabc050-c33c-47e5-8011-14404e5ee2d5', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'USERND-MP-04', 4, 'Asignación inicial de usuarios activos confirmados', 'f2f5f816-ec4f-46e1-b216-5267aeadc635'),
  ('6a575c68-91df-402d-ad96-df8565823c93', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'USERND-MP-05', 5, 'Asignación inicial de usuarios activos confirmados', 'f2f5f816-ec4f-46e1-b216-5267aeadc635');

insert into public.nodal_management_history(
  user_id, desk_id, actor_id, effective_month, action, before_data, after_data
)
select
  identifiers.user_id,
  identifiers.desk_id,
  'f2f5f816-ec4f-46e1-b216-5267aeadc635',
  date '2026-10-01',
  'user_identifier_assigned',
  null,
  jsonb_build_object(
    'display_id', identifiers.display_id,
    'desk_id', identifiers.desk_id,
    'reason', identifiers.reason
  )
from public.nodal_user_identifiers identifiers
where identifiers.display_id in (
  'USERND-MP-01', 'USERND-MP-02', 'USERND-MP-03',
  'USERND-MP-04', 'USERND-MP-05'
);

commit;
