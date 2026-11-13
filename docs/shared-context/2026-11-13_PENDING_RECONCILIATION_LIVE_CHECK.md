# Pendiente entre áreas — certificación operativa de conciliación

Fecha: 13/11/2026. Áreas: Correcciones a clientes, Modificaciones y Nodalito.

Servidor productivo `9eafac40a99e`; migraciones 20261113233000, 20261113234000 y 20261113235000 aplicadas. No requiere conector nuevo. Registro principal: `RECONCILIATION_SERVER_RECOVERY_2026-11-13.md` en Registros de conocimiento.

Hecho: 817 pruebas aprobadas, compilación y despliegue aprobados, prueba transaccional productiva de recepción Sebas→broker David aprobada con rollback y cero residuos.

Pendiente: ante la siguiente operación real que llegue desde una identidad, comprobar recibos persistidos, sesiones broker/prop, asociación correcta por titular e identidad, conciliación única y reflejo completo en Cuentas (asientos, días, flotante y estado). Comparar también saldos contable/recibido y su diferencia cuando exista. Repetir el reproceso debe conservar los mismos movimientos, sin duplicados.

No enviar órdenes para generar evidencia. No afirmar certificación de extremo a extremo antes de observarla. Casos históricos con reparación previa compatible o asignación ambigua requieren revisión; no liberar masivamente ni duplicar pérdidas. Nodalito debe distinguir diagnóstico, publicación técnica y validación operativa.

Observación de cola al publicar: un trabajo previo para conector `b1076077-2745-4d9a-b80b-64381e8b1203`, revisión 2397 / completada 1658, 681 intentos, `processing_unavailable`, última actualización 13/11 05:20 UTC (anterior al despliegue). No se lo marcó completado ni se atribuyó su fallo a este release. Si vuelve a recibir datos, revisar su resultado y antigüedad del historial pendiente; los trabajos anteriores a esta migración no conservaban `replay_since`.
