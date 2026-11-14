# 2026-11-14 — Baltazar: aumento informado sin nuevo pendiente
Área: conciliación / servidor / Nodalito. Diagnóstico; sin nueva reparación aplicada.

Evidencia: exportación original client-audit-20261113/snapshot-before.json e inventory-changes.json. Broker 2234971: último saldo conciliado 1379.08; inventario 2026-11-13T19:07:57.213377Z informó 9930.08. Diferencia 8551.00. Esto prueba recepción de saldo, no procedencia wallet ni depósito.

Código revisado: ingest/route.ts llama ensureNinjaBrokerBalanceBaseline, que no compara saldos cuando existe estado. recordNinjaBrokerPreOperationBalance omite insertar una nueva diferencia si existe cualquier evento pending ninja-preoperation del conector. En snapshot original persistía daf16a0a-ed9b-4587-87ce-0b0da4556818, ninja-preoperation:879391, del 30/10. La protección no distingue una diferencia nueva de la antigua. Esta combinación explica ausencia de nuevo pendiente pese a recibir inventario actualizado.

El evento ninja-preoperation:1356951 fue insertado por la reparación anterior; no atribuirlo a detección automática original. Cinco payouts suman 9000, comisiones 50, cobro a wallet: no prueban transferencia de 8551.

Pendiente: corregir deduplicación por evidencia específica y detección de variaciones de inventario, sin confundir PnL ni repetir diferencias previas. Validar con reproducción antes de desplegar. No se cambió producción en esta investigación. Rollback: no aplica al diagnóstico.

Nodalito: distinguir lectura recibida, creación del evento y clasificación del movimiento. Una alerta ausente no prueba falta de telemetría. Consultar pendientes antiguos que suprimen nuevos eventos.

Sincronización Drive pendiente; conector no disponible en sesión anterior. No se afirma sincronizado.
