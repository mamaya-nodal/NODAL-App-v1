# Conciliaciones: período actual e histórico

- Fecha: 2026-11-11
- Área: Nodal App (modificaciones)
- Alcance: vista de Operaciones para todos los usuarios
- Estado de sincronización: pendiente; el conector integrado de Google Drive informó que las acciones de lectura no están disponibles en este chat.

## Síntoma

Las conciliaciones del período vigente y las históricas utilizaban la misma jerarquía visual. El primer mes de la lista se abría por posición y los períodos anteriores ocupaban el mismo espacio que el actual.

## Causa

La interfaz renderizaba todos los meses con la misma clase y abría automáticamente el primer elemento mediante su índice, sin distinguir el mes calendario vigente de los meses archivados.

## Cambio aplicado

- El mes vigente se identifica de forma explícita y permanece abierto con jerarquía principal.
- Los meses anteriores se muestran como filas compactas y cerradas.
- Cada período histórico puede desplegarse para consultar sus conciliaciones.
- El encabezado general pasa de `Historial` a `Conciliaciones`.
- Se agregó una regla determinista y una prueba para separar período vigente e histórico.

## Evidencia y validación

- Pruebas de dominio: 4 aprobadas.
- TypeScript: aprobado.
- ESLint de los archivos modificados: aprobado.
- Build productivo de Next.js: aprobado.
- La validación visual local quedó limitada porque el entorno local no tiene configuradas las variables públicas de Supabase.

## Riesgos

- El cambio no altera telemetría, conciliación ni contabilidad; sólo presentación y estado inicial de los desplegables.
- La vista conserva el alcance temporal existente de mes actual y mes anterior.

## Rollback

Revertir las clases `is-current` / `is-archived`, la separación de meses y los estilos compactos agregados en este cambio.

## Impacto para Nodalito

No requiere una nueva reparación ni detección. Puede explicar que el período actual aparece desplegado y los períodos anteriores se consultan expandiendo su fila.

