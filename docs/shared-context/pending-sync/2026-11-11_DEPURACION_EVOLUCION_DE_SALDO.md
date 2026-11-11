# Depuración de la evolución de saldo

- Fecha: 2026-11-11
- Área: Nodal App (modificaciones)
- Alcance: vista Operaciones
- Estado de sincronización: pendiente; Google Drive continúa sin acciones disponibles en este chat.

## Síntoma

La vista mostraba la tarjeta desplegable moderna `Evolución del saldo` y, debajo, un listado anterior de registros que repetía la evolución operación por operación.

## Cambio aplicado

- Se conserva la tarjeta desplegable `Evolución del saldo` con saldo anterior, variación y saldo nuevo.
- Cuando esa tarjeta dispone de datos, el listado heredado deja de renderizarse.
- El listado anterior queda únicamente como respaldo para casos sin historial automático de saldo, evitando perder la revisión de registros manuales antiguos.

## Validación y riesgo

El cambio es exclusivamente de presentación. No elimina registros, controles diarios ni telemetría. La lógica de corrección histórica permanece disponible en el respaldo cuando no existe historial automático.

## Impacto para Nodalito

Sin reparación nueva. Nodalito puede indicar que la evolución del saldo se consulta desde la tarjeta desplegable única.

