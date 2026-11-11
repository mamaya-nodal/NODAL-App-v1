# Baltazar / Alanis — dos trades previos a actualizar el conector

- Fecha: 2026-11-11
- Área: Nodal App (correcciones a clientes)
- Usuario: Baltazar Almirón
- Identidad: Alanis Santana
- Estado de sincronización: pendiente; el conector integrado de Google Drive no estuvo disponible en este chat.

## Síntoma

Dos coberturas broker de Baltazar quedaron registradas el 11/11 a las 11:58:31 y 12:00:46 ART, pero no conciliaron automáticamente. Los resultados fueron -US$ 105,74 y -US$ 100,74.

## Causa y evidencia

El conector anterior de la identidad no transmitió eventos ni sesiones prop de las cinco cuentas Funded de Alanis. La base conservó las dos sesiones broker cerradas y generó dos lotes bloqueados con `Cobertura sin cuentas prop compatibles`. Las cinco cuentas activas de Alanis quedaron identificadas por sus números LFF 001 a 005, y Mauricio confirmó que ambas operaciones se ejecutaron con ese grupo.

## Reparación

Se asignaron cronológicamente ambos lotes a las cinco cuentas de Alanis mediante el flujo auditado de asignación manual. La reparación genera dos controles diarios independientes, conserva la telemetría broker original y no cierra cuentas. Antes de aplicarla se verificó íntegramente dentro de una transacción revertida.

La primera aplicación reveló que la invariante general incorporada para conciliaciones automáticas sólo admitía miembros técnicos y rechazaba al confirmar cualquier lote reconstruido mediante la tabla auditada de asignaciones manuales. Se amplió la misma validación de Control Diario, Registro de Operaciones y recálculo de Cuentas para aceptar ambas fuentes; no se relajaron las comprobaciones económicas.

Se guardó el estado previo de los lotes y eventos de saldo en el esquema privado `private_baltazar_alanis_repair_20261111`. El rollback consiste en eliminar los dos controles creados y sus derivados, restaurar lotes y eventos desde ese esquema y conservar el evento de auditoría como antecedente de la reversión.

## Validación en producción

- Los dos lotes quedaron `committed`, sin causa de bloqueo.
- Control 26: saldo US$ 1.917,78 → US$ 1.812,04; resultado -US$ 105,74; cinco participantes y cinco asientos.
- Control 27: saldo US$ 1.812,04 → US$ 1.711,30; resultado -US$ 100,74; cinco participantes y cinco asientos.
- Las cinco cuentas LFF de Alanis permanecen abiertas y cada una recibió exactamente dos nuevos asientos.
- El redondeo indivisible de un centavo por lote se conserva explícitamente como diferencia de redondeo; no altera el resultado broker.

## Impacto para Nodalito

Detección generalizable: lote broker bloqueado sin participantes prop, con cuentas de una identidad activas pero sin telemetría del mismo horario. Nodalito debe distinguir entre falta de enlace verificable y ausencia real de telemetría, y sólo ofrecer reconstrucción cuando el grupo de cuentas sea inequívoco y exista confirmación humana.
