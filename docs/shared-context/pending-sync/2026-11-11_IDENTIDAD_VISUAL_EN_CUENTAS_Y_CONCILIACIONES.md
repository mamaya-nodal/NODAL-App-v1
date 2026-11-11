# Identidad visual en Cuentas, Operaciones y Conciliaciones

- Fecha: 2026-11-11
- Área: Nodal App (modificaciones)
- Alcance: todos los usuarios con identidades
- Estado de sincronización: pendiente; el conector integrado de Google Drive continúa sin exponer acciones de lectura en este chat.

## Síntoma

Las conciliaciones mostraban cuentas y conexiones, pero no la identidad a la que pertenecía cada cuenta. Para usuarios con varias identidades, las operaciones resultaban difíciles de distinguir. La orejeta Cuentas tampoco conservaba un código visual compartido con Operaciones.

## Causa

La interfaz disponía de la asignación cuenta-identidad en la carga principal, pero no la propagaba hacia las tarjetas de cuenta ni hacia la presentación de telemetría y conciliaciones.

## Cambio aplicado

- Cada cuenta asignada muestra el nombre de su identidad en Cuentas.
- Las operaciones activas muestran la misma identidad.
- Las conciliaciones pendientes, automáticas, recuperadas e históricas muestran las identidades participantes.
- Cada identidad recibe un matiz calculado de forma determinista sobre el círculo cromático completo a partir de su identificador, evitando las colisiones frecuentes de la paleta inicial de ocho colores.
- El color se mantiene estable entre vistas y tiene variantes legibles para modo oscuro y claro.
- El acento se limita al nombre de la identidad; las tarjetas no se pintan completas.

## Evidencia y validación

- La identidad se obtiene de `identity_account_assignments`, no del nombre libre de la conexión de NinjaTrader.
- Se agregaron pruebas de estabilidad y rango cromático.
- TypeScript, ESLint y las pruebas dirigidas fueron aprobados.

## Riesgos

- Una cuenta sin asignación de identidad continúa mostrándose sin acento y se interpreta como cuenta del titular.
- Cuando una conciliación agrupa varias identidades, muestra todos sus nombres con sus respectivos colores.
- La resolución visual usa la asignación vigente de la cuenta; una futura auditoría histórica puede requerir resolver la asignación efectiva a la fecha de cada operación si se habilita la reasignación temporal de cuentas.

## Rollback

Retirar los campos `identityId` y `identityName` de la presentación, el módulo `identity-accent` y las clases visuales asociadas. No se requiere revertir datos ni migraciones.

## Impacto para Nodalito

Nodalito puede orientar al usuario a identificar visualmente qué identidad intervino en una cuenta u operación. No se agrega una reparación automática.

