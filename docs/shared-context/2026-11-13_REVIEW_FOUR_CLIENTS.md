# Revisión David, Lorena, Nico y Baltazar — 13/11/2026

Área: correcciones a clientes / servidor / Nodalito. Alcance: cuatro usuarios expresamente solicitados. Estado: seis operaciones recuperadas; continuidad de Lorena y Baltazar requiere información concreta del usuario. No afirmar reparación completa de los cuatro.

## Evidencia y diagnóstico

Copia local de lectura: 137 cuentas, 83 controles previos, 325 asientos, 304 sesiones desde el 24/10, vínculos, compras, payouts e inventarios originales. Los 34 lotes no contabilizados iniciales incluían 29 anteriores a los nuevos puntos de partida; no equivalían a 34 operaciones económicas faltantes. Los 12 recibos pendientes de David/Lorena también eran anteriores al reinicio (octubre), no evidencia de una falla nueva de hoy.

- **David:** tres operaciones del 13/11 (+81,62; -3,88; +88,62), con cuentas compatibles y variaciones independientes del P&L realizado. El control económico 23 fue creado a las 19:06 UTC y corregido a las 19:26; el control 22 se insertó a las 19:26. Ordenar por creación elegía erróneamente el 22 y su saldo recibido 6.640,86 en lugar del 23 y 6.062,30. Causa confirmada y reproducida contra la copia productiva. La SQL transaccional de commit ya admitía continuar la diferencia documentada.
- **Nico / Stefano:** broker 2043987 pasó 12.994,72 → 13.304,82; P&L realizado 554,10 → 864,20. Inventarios sincronizados muestran cinco Lucid 001–005 pasando 50.000 → 48.803 y P&L -1.197, apertura observada 09/11 18:22:57 UTC y cierre 18:30:41 UTC. No llegaron ejecuciones de ese ciclo. La evidencia prueba resultado +310,10 y participantes, sin inventar telemetría original. La causa de la ausencia de ejecuciones no queda demostrada por el inventario. Última versión reportada 0.17, no prueba por sí sola de la causa.
- **Baltazar:** primer trade 13/11 -547,22, broker 2234971 y cinco Lucid del titular 031–035; P&L independiente y tres ejecuciones confirman el resultado. Antes de operar, saldo 1.379,08 → 9.930,08: +8.551 no clasificados; se preguntó si hubo ingreso de dinero u operaciones intermedias. No inventar depósito. Otros ciclos -1.061,48 y +2.058,52 requieren continuar la reconstrucción y clasificar ese salto; sin ingreso contable la segunda operación dejaría saldo contable negativo. El último ciclo estaba plano con saldo final, pero seguía `settling` porque no transcurrieron los diez segundos de espera antes del último procesamiento; luego no llegaron más eventos. La reconstrucción con el mismo stream y tiempo posterior lo cierra correctamente.
- **Lorena:** último control previo 27, broker 7.485,78. Inventarios y P&L prueban siete cambios posteriores: 11/11 -541,48; -62,70; +295,60; +654,26; 12/11 -280,90; -321,48; -398,40. Saldo final observado 6.830,68. El primero corresponde a cinco Tradefy Funded de David Malagreca; payouts de segunda vuelta anteriores al trade permiten tercera vuelta. Hay cuentas no registradas: Camila Lucid 006–010, Gino Lucid 056/058/060 y cinco Tradefy de Gino. Se solicitaron precios reales, sin reutilizar los de otras compras. Camila muestra además operaciones prop posteriores el 12/11 sin variación contemporánea del broker: no adjudicarles un resultado de broker inventado.

## Reparaciones aplicadas

- David: controles 24–26, un participante/asiento cada uno. Saldo contable 9.074,66; recibido 6.228,66; diferencia previa -2.846 preservada. Se retiró de pendientes una lectura preoperativa que repetía el saldo recibido ya registrado en el control 23, sin eliminar evidencia.
- Nico: control 4, +310,10 / cinco cuentas = +62,02 cada una, evaluación. Saldo broker 13.304,82. Compras reales 86,27 sin cambios; costo residual aritmético 24,25 por cuenta. Registro de origen inventario/P&L explícito; no se crearon eventos de ejecución ficticios.
- Baltazar: control 31, -547,22, cinco participantes/asientos. Saldo contable 831,86, recibido 9.382,86; diferencia previa +8.551 preservada pendiente. La última sesión 3865513 se reconstruyó cerrada, con resultado +2.058,52 verificado y lote pendiente visible; no se dio por contabilizada.
- Lorena: control 28, -541,48, cinco participantes/asientos, tercera vuelta, saldo broker 6.944,30. Las operaciones posteriores no se forzaron con grupos incompletos.

Los cuatro scripts aplicados son idempotentes por marca de auditoría. Antes de confirmar se ejecutaron con rollback y comprobaciones de importes, participantes y asientos. Copias previas productivas: `private_client_review_20261113.before_rows`; sin acceso de clientes. Marcas: `client_review_20261113_*` en `audit_events`.

## Cambios generales y validación

- Servidor `84e15290236d`: el checkpoint prioriza número económico de control sobre fecha de guardado. Regresión con dos controles guardados en orden inverso; la primera operación de David pasa de bloqueada a lista sin modificar su resultado.
- Servidor `65610e6c2f68`: conserva el trabajo/cursor de reconstrucción cuando el último ciclo está plano pero todavía estabilizando, para que la siguiente pasada lo cierre sin exigir otra ejecución. No convierte posiciones abiertas en cerradas.
- 178 suites / 819 pruebas aprobadas; comprobación TypeScript aprobada. Salud de producción y base verificadas después de cada publicación. No se cambió versión del conector.
- La prueba de recepción productiva anterior y estas reconstrucciones históricas son evidencias diferentes. Sigue pendiente observar una operación nueva posterior al despliegue desde Ninja hasta Cuentas.

## Riesgos, rollback e impacto para Nodalito

No tratar diferencias de saldo como depósitos/retiros por signo o monto; no registrar cuentas sin precio confirmado. No rehacer operaciones anteriores al nuevo punto de partida. No usar fecha de creación para inferir orden económico de reparaciones. No confundir inventario recibido con ejecuciones recibidas.

Revertir una reparación exige reconstruir su cadena, participantes y asientos desde la copia previa; no basta borrar el control. La telemetría original se conservó. Para servidor, revisar commits anteriores; las versiones previas están en Git. Revertir el checkpoint devolvería la causa confirmada de David.

Nodalito: incorporar recuperación con inventarios/P&L cuando sea verificable, distinguir cuentas sin registrar de eventos ausentes, pedir precios/identificaciones faltantes, conservar diferencias anteriores y comprobar todas las pestañas. La guía común se actualizó; desarrollar o ampliar una herramienta de reparación requiere el área Nodalito, no se adquiere capacidad solo con este documento. Continuidad: `Pendientes entre áreas`, mismos dos datos solicitados al usuario.
