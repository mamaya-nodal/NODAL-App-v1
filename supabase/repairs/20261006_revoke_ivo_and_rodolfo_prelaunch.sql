-- Baja lógica solicitada antes de la apertura definitiva. Conserva perfiles,
-- autenticación, identificadores históricos, registros y auditoría. Los
-- correlativos USERND-MP-01 y USERND-MP-05 no se reutilizan.

select public.revoke_nodal_user_by_email(
  'ivosebastianpirrone@gmail.com',
  'Baja previa al lanzamiento confirmada por Admin Master; se conserva historial e ID'
);

select public.revoke_nodal_user_by_email(
  'rodolfoth1982@gmail.com',
  'Baja previa al lanzamiento confirmada por Admin Master; se conserva historial e ID'
);
