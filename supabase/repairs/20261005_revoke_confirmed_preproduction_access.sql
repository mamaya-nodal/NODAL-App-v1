-- Baja lógica confirmada de accesos preproductivos. Conserva auth, perfil,
-- historial y auditoría. Ejecutado en producción el 2026-10-05 mediante la
-- función pública auditada revoke_nodal_user_by_email.

select public.revoke_nodal_user_by_email(
  'mamaya@nodaltrading.com',
  'Depuración de accesos preproductivos confirmada por Admin Master; se conserva historial'
);
select public.revoke_nodal_user_by_email(
  'martin.maina.trad@gmail.com',
  'Depuración de accesos preproductivos confirmada por Admin Master; se conserva historial'
);
select public.revoke_nodal_user_by_email(
  'jas42200@gmail.com',
  'Depuración de accesos preproductivos confirmada por Admin Master; se conserva historial'
);
