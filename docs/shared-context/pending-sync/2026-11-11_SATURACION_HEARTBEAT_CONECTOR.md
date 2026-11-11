# NODAL — Saturación por reconstrucción en heartbeat del conector

- Fecha: 2026-11-11
- Área: Nodal App (modificaciones) / conector NinjaTrader
- Alcance: todos los usuarios y conectores; incidente reportado inicialmente por David Zabaleta
- Estado documental: pendiente de sincronizar con `NODAL - Estado vigente` y `Registros de conocimiento/` porque el conector integrado de Google Drive no estuvo disponible para este chat.

## Síntoma

La aplicación quedaba cargando o no abría mientras varios conectores transmitían simultáneamente. David estaba activo, con período vigente y sin bloqueo de acceso.

## Causa confirmada

El endpoint `/api/integrations/ninjatrader/heartbeat` ejecutaba en cada latido tres reconstrucciones completas: saldo broker, operaciones técnicas y transiciones de cuentas. El conector nuevo transmite y reintenta con mayor constancia; esa actividad expuso el defecto y multiplicó trabajos redundantes sobre Supabase.

La telemetría y el inventario ya poseen sus propios caminos de procesamiento. La reconstrucción adicional del heartbeat no era necesaria y producía contención.

## Evidencia

- Vercel registró ráfagas de timeouts de 300 segundos en `heartbeat` e `ingest` y de 60 segundos en `telemetry/v2`.
- Supabase conservaba activa la corrección `NODAL_LOCK_ORDER_V2`, por lo que no se trató de una migración faltante.
- Consultas de diagnóstico simples demoraron varios segundos durante la saturación.
- La cuenta de David, su workspace y el período contable estaban activos.

## Cambio aplicado

El heartbeat quedó limitado a autenticar el conector, registrar sus versiones y ofrecer el drenaje durable de telemetría v2. Ya no reconstruye saldo, operaciones ni transiciones en cada latido. Esos procesos permanecen en los endpoints que reciben inventario y telemetría.

## Validación

- 792 pruebas aprobadas.
- Compilación de producción aprobada.
- Lint sin errores; permanecen 10 advertencias anteriores no vinculadas.
- Prueba específica del heartbeat: conserva versiones, admite latidos antiguos sin cuerpo, limita tamaño y falla de forma controlada si no puede guardar la versión.

## Riesgos y rollback

El riesgo principal es que un conector legado dependa del heartbeat para reintentar una reconstrucción fallida. El inventario vuelve a procesar saldos y transiciones; la telemetría posterior reprocesa operaciones, y v2 conserva cola durable. Si se detecta una omisión real, debe incorporarse un trabajo durable y coalescido; no debe reponerse la reconstrucción completa por latido.

Rollback: revertir el cambio de `heartbeat/route.ts`, únicamente si existe evidencia de pérdida y antes se limita la frecuencia mediante una cola o lease por conector.

## Impacto para Nodalito

Agregar detección de ráfagas de timeouts en intake, latencia elevada de Supabase y múltiples reconstrucciones simultáneas por conector. La explicación debe diferenciar datos inválidos del conector de saturación del procesamiento de backend.
