# Baltazar — corrección Alanis 001 y límite de Nodalito

Fecha: 2026-11-12  
Área: Nodal App (correcciones a clientes) / Nodalito  
Estado: corrección productiva aplicada y verificada; pendiente de sincronización con Drive porque el conector integrado devolvió `MCP tool codex_apps/google_drive.fetch is not available to the model`.

## Alcance

Baltazar solicitó corregir dos conciliaciones del 11/11/2026 que habían sido reconstruidas sobre las cinco cuentas Funded de la identidad Alanis. Confirmó que ambas operaciones pertenecieron únicamente a `LFF05098109210001`.

## Evidencia y causa

- Lotes broker: `8faac2a9-4282-4462-a65a-894fe15a9728` y `0c06c232-b4de-450e-bfe9-883f34be03ac`.
- Resultados broker originales: -US$105,74 y -US$100,74.
- Controles: `12e0b3a0-200b-4117-86de-7fa1a1792167` y `ebe8afea-8d5a-4860-9c5c-afdf20b6d52b`.
- La reconstrucción del 11/11 había distribuido cada resultado en cinco cuentas porque el conector de la identidad no había transmitido sesiones prop y la confirmación operativa inicial indicó el grupo completo.
- La nueva confirmación del propio usuario corrigió esa distribución: una sola cuenta, terminada en `001`.

## Cambio aplicado

- Se eliminaron de esos dos controles los participantes y asientos de `002`, `003`, `004` y `005`.
- `LFF05098109210001` quedó como único participante y líder.
- Se asignaron a `001` los resultados completos: -10.574 y -10.074 centavos.
- Los lotes quedaron con distribución exacta y diferencia de redondeo cero.
- Se actualizaron observación y motivo de asignación.
- Se preservó copia previa en `private_baltazar_alanis_001_repair_20261112`.
- Auditoría: `baltazar_alanis_trades_reassigned_to_001`.

## Validación

- Cada lote tiene exactamente una asignación manual, a `LFF05098109210001`.
- Cada control tiene exactamente un participante y un asiento.
- La suma de cada asiento coincide exactamente con el resultado broker.
- Las cuatro cuentas restantes ya no reciben esas operaciones.

## Situaciones separadas detectadas

Existen tres lotes posteriores del 11/11/2026, del broker `2234971`, todavía bloqueados y sin sesiones prop:

- `7fb49704-5372-474d-a10d-4471a57b07ff`: -US$110,74.
- `751c2eb8-95c4-4201-bb6c-6d97a64748ab`: -US$115,74.
- `03516c9f-75c6-41df-8d68-1d784e078b19`: -US$105,74.

No se asignaron automáticamente porque la telemetría sólo prueba los cierres broker y no identifica qué cuenta o cuentas prop participaron. Se necesita confirmación operativa para evitar una distribución inventada.

## Por qué Nodalito no pudo

La acción disponible `coverage_members` sólo admite lotes pendientes. `apply_nodalito_repair` exige que `daily_control_id` sea nulo; una conciliación ya confirmada genera `NODALITO_BATCH_SCOPE_OR_ALREADY_COMMITTED`. Además, el bloque de errores de `openai-nodalito.ts` oculta el error concreto y devuelve un texto genérico.

## Impacto para Nodalito

Agregar una acción específica para corregir participantes de una conciliación confirmada, con:

1. selección inequívoca de lote/control y cuentas del mismo usuario e identidad;
2. vista previa de participantes y asientos actuales frente a los propuestos;
3. redistribución atómica de participantes, asientos y asignaciones manuales;
4. verificación de suma contra el resultado broker;
5. actualización conjunta de Cuentas, días y flotante derivados;
6. copia reversible y auditoría;
7. mensaje concreto cuando el lote está confirmado, en vez del error genérico;
8. una sola pregunta al usuario cuando falte únicamente la cuenta participante.

## Rollback

Restaurar las cinco tablas afectadas desde el esquema `private_baltazar_alanis_001_repair_20261112` dentro de una transacción y registrar la reversión. No borrar la telemetría broker ni los eventos de auditoría.
