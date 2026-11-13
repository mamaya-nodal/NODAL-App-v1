# Extensión excepcional del período vigente hasta fin de noviembre

Fecha: 2026-11-13  
Área: Nodal App (modificaciones)  
Alcance: calendario contable global de producción

## Decisión

Por indicación de Mauricio, el período vigente identificado como `2026-10-01`
no cierra el 13 de noviembre. Permanece activo durante todo noviembre y su
cierre queda programado para el final del `2026-11-30` en hora Argentina. El
período siguiente, identificado como `2026-11-01`, comienza el `2026-12-01`.

## Estado previo y evidencia

- La base tenía 28 períodos `2026-10-01` abiertos y 34 programados para cerrar
  el `2026-11-13 19:00 ART`.
- Existían 25 períodos siguientes programados para comenzar el `2026-11-16`.
- Antes del cambio se verificaron cero versiones de cierre para el período
  actual y cero cierres ejecutados durante el día.

## Cambio aplicado

- Se cambió en producción el cierre de todos los períodos `2026-10-01`
  abiertos o programados a `2026-11-30 23:59:59 ART`.
- Se reprogramó el inicio de todos los períodos `2026-11-01` programados al
  `2026-12-01`.
- Se ajustaron las funciones de calendario de base de datos y aplicación para
  reconocer esta excepción.
- Se creó un respaldo privado de las filas afectadas y 87 eventos de auditoría.
- No se modificaron movimientos, cuentas, operaciones, conciliaciones, payouts
  ni facturación.

## Validación

- `2026-11-30 23:59:59 ART` pertenece al período `2026-10-01`.
- `2026-12-01 00:00:00 ART` pertenece al período `2026-11-01`.
- Los 62 períodos actuales comparten el nuevo cierre y ninguno figura cerrado.
- Los 25 períodos siguientes comparten el nuevo inicio.
- Pruebas unitarias del calendario y comprobación de tipos aprobadas.

## Riesgos y continuidad

El período siguiente conservará, salvo decisión posterior, su cierre ordinario
del `2026-12-11 19:00 ART`. Esto produce un período corto entre el 1 y el 11 de
diciembre y debe revisarse antes de esa fecha si se desea otra duración.

## Rollback

El estado previo quedó preservado en
`private_period_extension_20261113.periods`. Para revertir se deben restaurar
las fechas desde ese respaldo y volver a publicar las funciones de calendario
anteriores. No se debe borrar la auditoría.

## Impacto para Nodalito

Nodalito debe consultar el calendario efectivo y no inferir el período por el
mes civil. Durante noviembre de 2026 debe informar que continúa vigente el
período `2026-10-01` y que el siguiente comienza el 1 de diciembre.

## Sincronización pendiente

El conector de Google Drive no estuvo disponible para este chat. Este registro
debe incorporarse a `NODAL - Estado vigente`, al índice pertinente y a los
registros de conocimiento cuando se restablezca el acceso al cerebro común.
