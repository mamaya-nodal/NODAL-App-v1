# David Zabaleta — conciliaciones omitidas por tolerancia temporal

- **Fecha:** 2026-11-13
- **Área:** Nodal App (correcciones a clientes) / conciliador Ninja
- **Usuario:** David Johel Zabaleta Mallqui
- **Estado:** reparación productiva aplicada y verificada; sincronización al
  cerebro común de Drive pendiente porque el conector integrado no estuvo
  disponible.

## Síntoma

La operación broker del 12/11 por +US$ 959,10 y la primera del 13/11 por
+US$ 83,10 figuraban sin cuentas compatibles, aunque Ninja había registrado las
cinco cuentas Lucid `LFE05091372320051` a `...055`.

## Causa confirmada

El correlador aceptaba una diferencia máxima de 10 segundos entre la apertura
broker y las réplicas. MIMICAL demoró 14 segundos el 12/11 y entre 15 y 16
segundos el 13/11. Las sesiones, direcciones, instrumentos y cierres prueban que
eran las cinco participantes correctas, pero el margen las excluyó.

## Evidencia

- Broker 12/11: sesión `3840406`, resultado `95910` centavos.
- Réplicas 12/11: sesiones `3840430`, `3840424`, `3840422`, `3840428`,
  `3840419`.
- Broker 13/11: sesión `3850014`, resultado `8310` centavos.
- Réplicas 13/11: sesiones `3850024`, `3850020`, `3850022`, `3850018`,
  `3850026`.
- Saldo contable anterior: US$ 8.348,26.
- Saldo broker tras la primera operación: US$ 9.307,36.
- Antes de la segunda operación apareció una diferencia no clasificada de
  -US$ 2.425,20; se conservó como diferencia de sincronización, sin inventar una
  transferencia.

## Cambio aplicado

- Controles 20 y 21 creados con 5 participantes cada uno.
- Distribuciones: US$ 191,82 por cuenta y US$ 16,62 por cuenta.
- Lotes `566bd537-...` y `20916067-...` marcados `committed` y vinculados a sus
  controles.
- Eventos broker correspondientes marcados `confirmed`.
- Cuentas 51–55 conservadas cerradas y con tres días operados registrados.
- Casos automáticos de sesiones omitidas del 12/11 resueltos.
- El margen de correlación de apertura aumenta de 10 a 20 segundos y se agrega
  una regresión con el tiempo exacto de David.

## Validación

- Control 20: 5 participantes, suma `95910`, saldo recibido `930736`.
- Control 21: 5 participantes, suma `8310`, saldo contable `939046`, saldo
  recibido `696526` y diferencia documentada.
- Prueba de correlación: 14/14 casos aprobados.

## Riesgos y límites

El lote `8dde7f62-...` por -US$ 324,40 queda pendiente y no se forzó: el broker
operó entre 17:06 y 17:08, mientras las cuentas 57–60 comenzaron a las 17:12 y
no estaban registradas. Hace falta clasificar el movimiento broker y, si
corresponde registrar esas cuatro cuentas, confirmar precio y etapa.

## Rollback

Las copias previas están en el esquema privado
`private_david_repair_20261113`, sin acceso para `public`, `anon` ni
`authenticated`. La migración productiva es
`20261113193000_repair_david_nov12_nov13_reconciliations.sql`.

## Impacto para Nodalito

La regla generalizable es: ante un lote sin cuentas, comparar primero las
sesiones prop con una ventana de hasta 20 segundos, dirección contraria y mismo
contrato lógico. No debe asociar operaciones separadas por minutos ni crear
cuentas inexistentes para forzar una conciliación.
