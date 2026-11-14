# Mauricio: limpieza personal y apertura bloqueada

Fecha: 2026-11-14. Área: correcciones a clientes / apertura.

Usuario autorizó limpiar datos ficticios personales conservando Admin Master.
Cuenta habitual: mauriciosebastianamaya@gmail.com; usuario f2f5f816-ec4f-46e1-b216-5267aeadc635.

## Causa y evidencia

Dos cuentas cerradas (be9d6ede-b10b-4b59-98a4-dfd4aa3ff18e y c3920486-cdff-4555-9e45-aaf5f46aa7e6, referencias 11/12) estaban en período actual 6948ded1-7fa4-44e4-87a3-4013a51ad506. Compras y operaciones del 2/10 pertenecen al período anterior 46deef83-7f88-4c90-9ef1-84a750166837. No existían controles del período actual ni carryovers para esas cuentas. El guard de inicio detectaba su actividad histórica e impedía archivarlas.

La prueba posterior encontró otro error independiente: revise_nodal_period_opening exigía mismo mes calendario, mientras confirm_nodal_period_opening ya validaba intervalo operativo. Se reprodujo con fecha 14/11 dentro del período extendido del usuario.

## Cambio aplicado en producción

- Dos cuentas cerradas devueltas al período original, manteniendo compras, operaciones y estado cerrado. Auditoría personal_test_history_archived_20261114 con previous_data permite revertir. No se borró telemetría, identidades, conectores ni permisos.
- Para respetar el trigger y unicidad de período abierto, el cambio de asignación se ejecutó con ambos períodos bloqueados y estado temporal intercambiado dentro de una sola transacción; los estados finales coinciden con los originales. Dos intentos previos fueron revertidos íntegramente por las protecciones de período cerrado/unicidad.
- Migración 20261114210000_opening_revision_operational_dates aplica la misma ventana operativa a las revisiones. No elimina autorización, guard de actividad, propiedad ni validación de importes.
- Definición previa guardada en audit_events, acción opening_revision_operational_dates_20261114; migración asentada en schema_migrations.

## Validación

confirm_nodal_simplified_opening ejecutada con usuario real, fecha 14/11, 48400 centavos, sin cuentas/billeteras: exitosa y revertida íntegramente. No se confirmó el inicio del usuario ni se consumió su permiso. Resultado final: current_accounts=0, opening_has_activity=false, opening_permission=approved, admin_master_access=admin, archived_test_accounts=2, date_patch=true.

Captura: outputs/mauricio-personal-opening-fixed-20261114.jpg en workspace principal.

## Riesgos / rollback / Nodalito

No atribuir el bloqueo al rol admin: es el permiso necesario para Admin Master y se conservó. No se modificó gestión comercial, unidades ni mesas. Restaurar período anterior de cada cuenta desde previous_data revierte archivo; restaurar función desde auditoría revierte guard de fechas. La prueba demuestra RPC, no un clic del navegador del usuario.

Nodalito: distinguir cuentas cerradas arrastradas con actividad solo en período original de actividad real del período nuevo. No borrar historia ni automatizar reasignaciones ambiguas. Revisiones de apertura deben usar intervalo operativo, no mes de etiqueta.

Drive pendiente: conector integrado falló al leer índice con MCP startup failed / handshaking / HTTP error decoding response body. No se sustituyó por otra cuenta ni se afirmó sincronización. Restablecer conexión mamaya@nodaltrading.com y sincronizar este registro/estado vigente.
