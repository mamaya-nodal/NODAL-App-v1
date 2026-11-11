# Evolución del saldo completa y origen por identidad

Fecha: 2026-11-11  
Área: Nodal App (modificaciones)  
Alcance: todos los usuarios; evidencia puntual en Baltazar Almirón

## Síntoma

En `Operaciones > Evolución del saldo`, Baltazar mostraba un salto entre el 9 y el 11 de noviembre. La contabilidad sí contenía tres controles del 10 de noviembre, pero la vista no los mostraba. Tampoco indicaba si cada variación provenía del titular o de una identidad.

## Causa confirmada

La vista se construía exclusivamente con `ninja_broker_balance_events`. Los controles recuperados desde inventarios consecutivos quedan asentados en `daily_controls`, pero no necesariamente crean un evento técnico de saldo. Por eso la secuencia visual quedaba incompleta aunque la contabilidad estuviera correcta.

## Evidencia de Baltazar

Los controles 23, 24 y 25 existen con fecha operativa 2026-11-10, saldos consecutivos `248648 -> 228500 -> 203352 -> 191778` centavos y participantes asignados a Alanis Santana. No fue necesario modificar esos registros.

## Cambio aplicado

- La evolución se arma desde todos los controles contables de tipo `balance_update`.
- Cuando existe el evento técnico correspondiente, se conserva su hora exacta.
- Los eventos técnicos sin control se mantienen para no perder saldos iniciales u observaciones independientes.
- Cada cambio muestra `Titular` o los nombres de las identidades participantes.
- Las identidades reutilizan el mismo color determinista de Cuentas y Conciliaciones.

## Validación

- TypeScript sin errores.
- 789 pruebas aprobadas.
- Compilación productiva aprobada.
- Consulta de producción confirmó que los tres cambios omitidos pertenecen a Alanis Santana.

## Riesgos y rollback

El cambio es de lectura y presentación; no altera saldos ni conciliaciones. Rollback: restaurar la construcción anterior basada sólo en `ninja_broker_balance_events` y retirar las etiquetas de origen.

## Impacto para Nodalito

Regla generalizable: un hueco visual en la evolución no prueba ausencia contable. Nodalito debe comparar `daily_controls` con `ninja_broker_balance_events` y distinguir entre registro contable faltante y evento técnico ausente.

## Sincronización pendiente

Google Drive no estuvo disponible mediante el conector integrado. Incorporar este registro al cerebro común y actualizar `NODAL - Estado vigente` cuando se restablezca.
