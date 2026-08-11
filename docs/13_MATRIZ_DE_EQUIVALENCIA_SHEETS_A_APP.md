# Matriz de equivalencia: Sheets a NODAL App

Estado: base de aceptación para validación.  
Propósito: asegurar que la aplicación conserve el servicio útil de la planilla
sin copiar su estructura de celdas ni pedir carga manual adicional.

## Cómo usar esta matriz

Cada fila responde cuatro preguntas:

1. ¿Qué resuelve hoy Sheets?
2. ¿Dónde lo resolverá la app?
3. ¿Qué resultado no puede cambiar?
4. ¿Cómo lo compararemos antes de habilitarlo?

`Confirmado` significa que la regla surge de las fuentes vigentes o de una
decisión ya aprobada. `Pendiente` indica que no se programará hasta validarla.
Una prueba aprobada requiere el mismo conjunto de datos de entrada y el mismo
resultado en Sheets y en la app; una diferencia se registra como hallazgo, no
se corrige cambiando la regla sin autorización.

## Matriz funcional

| Área actual de Sheets | Equivalente en la app | Resultado que debe preservarse | Estado | Prueba de aceptación |
|---|---|---|---|---|
| Acceso y hoja del alumno | Acceso privado con identidad Google y autorización NODAL | Cada alumno accede solo a su información; un administrador tiene el alcance autorizado. | Confirmado | Intentar acceder con dos usuarios y comprobar aislamiento total. |
| Real y Práctica / períodos | Selector de espacio y período, visible en toda pantalla | No se mezclan registros, saldos ni resultados de modalidades o meses distintos. | Confirmado | Cargar el mismo dato en ambos espacios y verificar resúmenes separados. |
| Compras General: N° Compra | Registro de compra | Consecutivo general generado automáticamente. | Confirmado | Crear compras sucesivas y comparar numeración contra el caso equivalente de Sheets. |
| Compras General: Empresa y Referencia | Formulario de compra | Referencia consecutiva independiente por empresa. | Confirmado | Crear cuentas en FFF y LUCID; ambas pueden tener referencia 1 sin mezclarse. |
| Compras General: precio y origen | Formulario de compra | El alumno carga solo precio y uno de los orígenes vigentes: `Aporte trader` o `Saldo generado`. | Confirmado | Intentar origen inválido y verificar rechazo; comparar importes válidos. |
| Compras General: estado | Vista de cuenta y Resumen | Una compra con precio, sin actividad, permanece `Cuenta virgen`. | Confirmado | Crear compra sin operaciones; confirmar que no pasa a viva. |
| Control Diario: fecha y número | Control Diario | Se conserva fecha operativa; el número es consecutivo cuando corresponde. | Confirmado | Registrar operaciones en fechas distintas de la carga y comparar orden/fecha. |
| Control Diario: depósito/retiro y saldo | Control Diario | Depósitos y retiros ajustan el saldo de referencia; no producen ganancia o pérdida. | Confirmado | Depositar, retirar y verificar saldo de referencia y resultado nulo. |
| Control Diario: resultado | Control Diario y vista previa | Sin movimiento de fondos, el resultado es la diferencia contra el último saldo ajustado. | Confirmado | Saldo 5.000 a 5.500: resultado total +500. |
| Control Diario: origen/destino | Movimiento de broker | Solo usa `Aporte trader`, `Saldo billetera` o `Retiro personal` mientras siga vigente esa configuración. | Confirmado | Verificar opciones exactas y efecto equivalente en el control. |
| Control Diario: líder y réplicas | Selector por empresa con grilla de cuentas | Líder y réplicas son selección explícita; no se infieren cuentas consecutivas. | Confirmado | Líder 01; réplicas 04, 07 y 08: solo participan esas cuatro cuentas. |
| Control Diario hacia Registro | Confirmación con vista previa | Una confirmación crea una entrada por cuenta participante, repartida en partes iguales cuando corresponde. No duplica al repetir la acción. | Confirmado | Resultado +500 entre cuatro cuentas: cuatro entradas +125; confirmar dos veces y contar cuatro, no ocho. |
| Registro de Operaciones: fases | Detalle de cuenta por fases | Conserva Evaluación y Primera a Quinta vuelta, con fecha y totales por fase. | Confirmado | Cargar un caso conocido en cada fase y comparar sus totales. |
| Registro: resultado positivo derivado | Entrada automática de fase | Un resultado positivo de Control Diario se registra como `NETO BROKER +` en cada cuenta participante. | Confirmado | Confirmar una operación positiva y comparar las entradas por cuenta. |
| Registro: pérdidas y arrastre | Servicio de cálculo de fases | El resultado económico negativo se guarda como magnitud positiva en `NETO BROKER -`; el total negativo se arrastra en valor absoluto y un positivo no se arrastra. | Confirmado por fórmulas vigentes | Usar caso anonimizado por fase y comparar destino, magnitud, total y arrastre. |
| Estados de cuenta | Servicio de estado y vistas | Sin actividad: virgen; actividad sin total positivo: viva; algún total positivo: cerrada. | Confirmado | Probar los tres escenarios y comparar estado y resultado bruto. |
| Correcciones | Historial de saldos y edición controlada | El valor corregido reemplaza al anterior en la operación normal, recalcula todas las cuentas derivadas y conserva una auditoría interna. | Confirmado | Corregir un saldo y comprobar que no se duplica, que todas las cuentas se recalculan y que existe traza interna. |
| Ajuste excepcional por cuenta | Editor final de distribución | La suma de resultados particulares debe coincidir exactamente con el resultado total de Control Diario. | Confirmado | Intentar confirmar USD 510 contra un total de USD 500 y verificar el bloqueo; ajustar a USD 500 y confirmar. |
| Resumen Operativo | Sección Resumen + síntesis en Inicio | Mantiene capital, flujo, resultado, estados, saldos, pendientes, comisiones y conciliaciones. | Confirmado | Reproducir un período conocido y comparar cada bloque. |
| Billetera | Movimientos externos de billetera | Los tipos vigentes no son ganancias operativas; el saldo surge de movimientos confirmados. | Confirmado | Registrar cada tipo válido y conciliar saldo contra Sheets. |
| Historial de retiros | Retiros de fondeo | Retiro aprobado queda pendiente; al cobrarlo, pasa a billetera y conserva ambas fechas. | Confirmado | Aprobar y luego cobrar: verificar pendiente, fecha de cobro y saldo. |
| Conciliación de ganancias | Detalle de conciliación | Ganancia cerrada = resultado período + flotante vivo + precio virgen; diferencia esperada cero. | Confirmado | Caso con diferencia cero y caso con diferencia explicada, sin ajuste automático. |
| Conciliación de capital | Detalle de conciliación | Compara posición observable y esperada; una diferencia se alerta y queda investigable. | Confirmado | Introducir diferencia controlada y comprobar alerta con sus fuentes. |
| Comisión estimada | Resumen de comisión | Usa ganancia realizada de cuentas cerradas, tramo vigente y exclusión de administradores. | Confirmado | Probar cada tramo con casos conocidos y comparar base, techo y comisión. |
| Resultado semanal | Resumen semanal | Muestra compras, resultado broker, retiros aprobados, posición y flotante del corte. | Confirmado; fórmula de corte a validar | Comparar una semana cerrada conocida. |
| Cierre mensual e histórico | Flujo administrativo de cierre | Conserva snapshots, arrastre y correcciones trazables; no borra ni reescribe el pasado. | Pendiente de Contabilidad | No implementar hasta tener procedimiento, responsables y casos aprobados. |
| Alertas | Centro de alertas y enlaces a origen | Informa diferencias, saldos desactualizados, pendientes y datos incompletos con motivo y estado. | Confirmado | Generar cada alerta en datos de prueba y comprobar explicación y vínculo. |

## Bloqueadores antes de programar cada área pendiente

| Tema | Qué falta validar | Propietario esperado |
|---|---|---|
| Cierre mensual | Pasos, reapertura, arrastre histórico, responsables y snapshot. | Contabilidad + Dirección |
| Retiros especiales | Parciales, anulados, reactivados o cobros múltiples. | Contabilidad |
| Roles concretos | Quién ve, aprueba, confirma, corrige y cierra. | Dirección + NODAL |
| Datos de prueba | Casos reales anonimizados y resultados esperados. | Áreas propietarias |

## Orden de implementación que se desprende de la matriz

1. acceso privado, aislamiento de alumno, modalidad y período;
2. compras y cuentas;
3. Control Diario con cálculo de saldo y selección explícita de réplicas;
4. confirmación automática hacia Registro de Operaciones para resultados
   positivos;
5. estados, resumen básico, auditoría y alertas;
6. billetera y retiros;
7. conciliaciones, comisión y vistas históricas;
8. cierres y automatizaciones externas, una vez validadas.

Este orden no reemplaza Sheets: cada bloque se habilitará solo después de una
ejecución paralela y una conciliación aprobada.

## Criterio de uso para el primer desarrollo real

La primera parte programable será el recorrido de los puntos 1 a 5, con datos
de prueba y sin integraciones productivas. Antes de iniciar su arquitectura se
deberán disponer de casos anonimizados con resultados esperados. El tratamiento
de resultados negativos y la politica central de correcciones ya quedaron
definidos.
