# Conciliación — corrección de servidor, 13/11/2026

Estado: publicado en producción el 13/11/2026, aproximadamente 19:13 ART. Servidor `9eafac40a99e5bd6eea7b4fd9e46c1bb5b92307d`; corrección principal `fe3b0c7c`. No requiere otra versión del conector. Pendiente observar una nueva operación real de punta a punta; no se certifica todavía ese resultado.

## Cambios
- Recepción v2: autoriza solo el broker reconocido del mismo titular, sin conceder un destino general a las prop. Un destino inválido queda pendiente con su recibo original; no revierte los eventos válidos del envío. El cliente existente rota recibos pendientes, por lo que la cola puede avanzar.
- Reconstrucción: conserva fecha mínima pendiente en un trabajo durable, detecta cuentas de eventos históricos aunque ya no aparezcan en el inventario, procesa hasta 10.000 eventos por cuenta y pasada y conserva un cursor. No finaliza una operación artificialmente en el límite de una página. Los eventos que llegan durante el trabajo se conservan para la siguiente pasada.
- Asociación: consulta sesiones/vínculos únicamente de instalaciones del mismo titular, conservando el origen de cada sesión. Tras reconstruir prop de una identidad se reevalúa el broker personal. Exige superposición de posiciones y marca conflicto si hay dos brokers no duplicados compatibles; no asigna por orden.
- Resultado: compara el cambio de saldo con lecturas independientes de P&L realizado y exige ejecuciones y lecturas antes/después. Si se contradicen, bloquea para revisar fondos/comisiones. Si el resultado está verificado, permite registrar ese trade conservando por separado el saldo contable y recibido y la diferencia previa.
- Registro tardío: el fallback usa el período económico real cuando está disponible; mantiene restricciones de compra, vida/reset y ambigüedad.
- Recuperación: el commit existente y la deduplicación siguen activos. Un trade anterior a otros ya confirmados, o compatible por fecha/importe con una reparación de fuente distinta, queda en revisión y no se vuelve a contabilizar automáticamente. Esa coincidencia es motivo de revisión, no prueba de duplicado.
- Reflejo: guardas diferidas verifican también cambios posteriores en miembros técnicos/manuales, participantes y asientos. Impiden confirmar un estado parcial y aceptan una reparación coherente dentro de una transacción. La vista usa asignaciones técnicas de lotes contabilizados para importes/días canónicos.
- Diferencia de fondos: la tarjeta se presenta como diferencia pendiente, sin afirmar que fue un retiro. Si el evento conserva su saldo esperado original, se muestra su diferencia de origen y no una resta contra un saldo contable posterior.
- Nodalito: guía de diagnóstico entre titular/identidades y duplicados, más hallazgo determinista cuando P&L realizado contradice el cambio de saldo. El corpus se regenera al publicar.

## Validación
- Suite completa: 177 archivos y 817 pruebas aprobadas. Siete pruebas de rutas aprobadas después del ajuste mínimo requerido por la compilación de producción. Compilación completa aprobada; despliegue de Vercel listo y endpoint productivo `/api/health?database=1` con revisión `9eafac40a99e`, base disponible, 80 ms en la lectura de comprobación.
- Tres migraciones aplicadas juntas en una transacción y registradas en `supabase_migrations.schema_migrations`. Cuatro funciones previas preservadas en `private_reconciliation_20261113.function_definitions`, sin acceso de clientes. Marcadores de recepción/continuidad y las cuatro guardas verificados en producción.
- Prueba productiva transaccional con el vínculo real Sebas → broker David: broker reconocido aceptado, evento hermano no autorizado conservado pendiente, repetición deduplicada y trabajo durable creado. La prueba completa terminó en rollback; no creó una operación económica.
- Comprobación posterior: cero eventos y recibos de prueba restantes. No llegaron nuevos recibos reales durante la ventana inicial de observación; no se atribuye un resultado operativo a una prueba que todavía no ocurrió.
- Regresiones TS: casos reales David 14–16 segundos, candidatos ambiguos, posiciones sin superposición, correlación entre titular e identidad y compra/operación en meses distintos.
- `scripts/test-ninja-receipts.mjs`: PostgreSQL aislado, migración real, broker compartido, destino inválido junto a evento válido, idempotencia, permisos y cursor con llegada antigua concurrente.
- `scripts/test-ninja-continuity.mjs`: función real y migraciones en PostgreSQL aislado; bloqueo sin verificación, registro con diferencia preservada, repetición sin duplicados, rechazo de alteraciones parciales y reparación consistente en una transacción.
- Durante las pruebas generales se cruzó el horario de cierre del 13/11; se fijó el reloj de dos suites de reparaciones para que sus fixtures no cambien de período durante la ejecución. No se cambió la regla de producción para acomodar una prueba.

## Límites y continuidad
No se deduce que todo evento ausente sea un error del conector. Si no hay lecturas independientes suficientes, no se fuerza la continuidad. Una comisión informada de forma distinta puede requerir revisión. La recuperación histórica ambigua requiere asociar la evidencia a los asientos previos, no borrar registros ni aplicar dos veces la pérdida. Un historial que no permita avanzar un bloque conserva su trabajo pendiente y requiere investigación.

La versión del conector no se cambia. Una prueba de código y base no sustituye observar una nueva operación real; esa verificación solo se declara al existir evidencia. No se envían órdenes de trading para probar contabilidad.

## Despliegue y reversión
Aplicadas juntas las migraciones 20261113233000, 20261113234000 y 20261113235000; publicado el servidor correspondiente. Se preservó `ff938fa3` (extensión del período), el piloto y los cambios concurrentes existentes de la rama principal. Se guardaron antes las definiciones productivas de las funciones modificadas. Las migraciones no crean asientos económicos ni borran telemetría original. El reproceso posterior puede crear asientos válidos: revertirlos requiere su auditoría, no solo restaurar código.

Para revertir la lógica: restaurar funciones desde la copia previa y el servidor anterior; retirar las cuatro guardas nuevas solo si es necesario. Las columnas aditivas y recibos pueden conservarse. Toda reversión debe mantener los movimientos económicos y la evidencia recibida.
