# Auditoría de producción posterior al reinicio

Fecha de lectura: 2026-11-02  
Alcance: usuarios activos, espacios reales y período operativo vigente.  
Carácter: sólo lectura; no se modificó ningún registro.

## Corte utilizado

- Reinicio general: 24/10/2026.
- Para cada usuario que confirmó o revisó su apertura después de esa fecha se
  utilizó la fecha efectiva de su última apertura como corte.
- Alfred / SB Digitalmarkets y Sebastián Bonincontro se revisaron, pero se
  mantienen identificados como usuarios especiales excluidos del consolidado
  general de Admin Master.
- Se revisaron 24 usuarios activos. También se controlaron siete registros no
  activos del padrón para detectar duplicados y residuos de acceso.

## Resultado ejecutivo

Hay cuatro defectos sistémicos que requieren corrección antes de considerar
confiable el consolidado general:

1. **Las revisiones del punto de partida excluyen compras válidas del mismo día.**
   Cuando una apertura tiene `revision_number > 1`, la carga actual considera
   anterior toda compra cuya fecha de negocio sea igual al día de corte, aunque
   la compra y la cuenta hayan sido creadas después de confirmar la apertura.
   Esto explica directamente diferencias de conciliación en David y Juan.
2. **La recuperación histórica de Lore se leía de forma incompleta.**
   Los cinco payouts de US$ 2.250,00 están pendientes de cobro y correctamente
   todavía no generan `TOTAL RETIRO`. El error real era que el resumen aceptaba
   los controles recuperados después del reinicio, pero excluía sus asientos y
   parte de los precios por conservar fechas históricas anteriores al corte.
3. **Hay cuentas marcadas cerradas sin operación económica registrada.**
   Se encontraron principalmente en Baltazar, Felipe, Javier, Lore y Mauricio.
   Algunas pueden corresponder a quemas reales, pero hoy el sistema no conserva
   evidencia operativa suficiente y en varios casos transforma sólo el precio
   de compra en resultado negativo realizado.
4. **Persisten lotes y eventos técnicos sin resolución.**
   Javier acumula 915 recibos pendientes; Leonardo tiene 22 lotes sin cuentas
   asignadas; también hay casos en Julián, Baltazar, Felipe y Franco. Estos datos
   prueban que hubo actividad que no terminó en un registro económico completo.

## Importes que sí quedaron explicados

### Alejandro Cambieri

- Payout bruto total: US$ 3.578,00.
- Cuenta 1: payout US$ 1.789,00; después de recuperar precio y flotante genera
  US$ 348,42.
- Cuenta 2: payout US$ 1.789,00; después de recuperar precio y flotante genera
  US$ 450,46.
- Ganancia realizada correcta: **US$ 798,88**.
- Flotante aún abierto: **-US$ 1.133,94**.
- Conciliación de ganancias: cero.

### Franco Seco

- Payout Lucid: US$ 1.784,55.
- Flotante recuperado por ese payout: US$ 87,54.
- Ganancia realizada del payout: US$ 1.697,01.
- Resultado terminal posterior de Lucid: US$ 999,26.
- Resultado cerrado de una Tradefy: US$ 555,31.
- Ganancia realizada total: **US$ 3.251,58**.
- Conciliación: diferencia de un centavo por redondeo.

### Lore

- Payouts aprobados: **US$ 11.250,00**.
- Los cinco payouts permanecen pendientes de cobro y no integran todavía la
  ganancia ni reducen el flotante.
- Con la lectura corregida, ganancia realizada: **US$ 758,80**.
- Flotante abierto: **-US$ 4.833,96**.
- Diferencia de conciliación: **-US$ 0,02**, correspondiente a redondeo.

## Hallazgos por usuario

| Usuario | Estado de auditoría | Evidencia principal |
|---|---|---|
| Adrian Gotusso | No configurado | Conector 0.16 vinculado, pero sin período real ni apertura confirmada. |
| Alejandro Cambieri | Consistente con observación | Cinco cuentas vivas, dos payouts; ganancia realizada US$ 798,88 y conciliación cero. Queda un evento de saldo pendiente. |
| Alejandro Oyola | Configurado, sin actividad reciente | Tres cuentas vírgenes; sin operaciones; conector 0.16 sin señal en las últimas 24 h. |
| Baltazar Almirón | Requiere revisión | Cinco cuentas Lucid nuevas quedaron cerradas con precio de US$ 130,00 cada una y sin operación registrada. Existe además un lote de -US$ 1.051,48 sin cuentas asignadas. La diferencia contable actual es sólo US$ 0,04. |
| Cristian Sandoval | Configurado, sin actividad | Apertura en cero, sin cuentas ni operaciones. Un evento de saldo pendiente. |
| David Zabaleta | Corregido en lectura | Cinco cuentas vivas. Las cinco compras de US$ 272,30 fueron creadas minutos después del corte y ahora integran el ciclo. La diferencia queda en US$ 0,02 de redondeo documentado. |
| Felipe Ortiva | Requiere revisión | Cinco Tradefy fueron cerradas sin operaciones y generan -US$ 688,10 sólo por sus precios. Hay un lote de +US$ 684,26 sin asignación y cuatro eventos de saldo pendientes. |
| Franco Seco | Contabilidad principal consistente | Ganancia realizada US$ 3.251,58; diferencia de un centavo. Queda un lote antiguo de -US$ 55,74 sin asignar y un evento de saldo pendiente. |
| Gastón Rivainera | Consistente | Apertura confirmada, broker US$ 11.627,62, sin actividad posterior ni diferencias. |
| Gonzalo Ibarra | No configurado | Sin período, apertura ni conector activo. |
| Hernán | No configurado | Conector 0.16, pero sin período ni apertura; sin señal reciente. |
| Ivo Pirrone | Configuración desactualizada | Apertura confirmada sin actividad; conector activo 0.15 y sin señal reciente. |
| Javier Torales | Error técnico grave | Cinco cuentas Lucid cerradas sin operaciones. Tiene 915 recibos de transporte pendientes y un evento de saldo pendiente. Su actividad técnica no está llegando de forma íntegra al registro económico. |
| Juan Carlos Sánchez | Error contable confirmado | Cinco cuentas vivas de US$ 432,19 cada una; diferencia -US$ 2.160,95. Apertura revisión 2: las compras posteriores a la apertura fueron excluidas por la misma regla defectuosa de fecha. También queda un recibo pendiente. |
| Julián Seco | Requiere revisión técnica | Cinco cuentas vivas sin registro operativo posterior. Un lote en conflicto de -US$ 6.901,48, otro sin asignar de -US$ 535,74 y dos eventos de saldo pendientes. |
| Leonardo Kenig | Error técnico grave | Conector 0.15. Veintidós lotes desde el reinicio quedaron sin cuentas prop asignadas y existen veintidós eventos de saldo pendientes. |
| Lorena Malagreca | Corregida en lectura | La recuperación histórica conserva precios, controles y asientos como una unidad. Resultado realizado US$ 758,80 y diferencia -US$ 0,02. Sus cinco payouts siguen correctamente pendientes de cobro. Una identidad todavía transmite con 0.15. |
| Lucas Cutri | Configurado, sin actividad | Apertura en cero; conector 0.16 sin señal reciente; sin cuentas ni movimientos. |
| Mauricio Amaya | Residuo anterior | Dos Lucid antiguas continúan cerradas, sin compra ni operación. No afectan hoy el importe calculado, pero deberían quedar fuera del ciclo vigente. |
| Nicolás | Consistente sin actividad posterior | Cinco cuentas vivas, broker US$ 10.887,52, conector 0.16 y sin diferencias de conciliación. |
| SB Digitalmarkets / Alfred | Especial, fuera del consolidado | Conserva la estructura anterior al reinicio. Sus diferencias y conectores viejos no deben mezclarse con Admin Master general; requiere auditoría separada si se desea sanear su expediente. |
| Sebastián Bonincontro | Especial, fuera del consolidado | Sin cuentas económicas en el período general; registra actividad técnica no asignada. Mantener aislado del consolidado. |
| Sebastián Curbelo | No configurado | Sin período ni apertura; dos recibos pendientes en conectores de sus identidades. |
| Víctor Meléndez | Configurado, sin actividad | Apertura y broker registrados; sin cuentas u operaciones. Un evento de saldo pendiente. |

## Registros no activos del padrón

Estos registros no se incluyeron en los cálculos económicos del período porque
no tienen acceso activo. Se conservaron en la auditoría para no ocultar
duplicados o residuos administrativos:

| Registro | Estado observado | Observación |
|---|---|---|
| Baltazar Almirón | Revocado | Existe además el registro activo de Baltazar Almiron. Debe conservarse sólo como antecedente, no como segundo usuario operativo. |
| Hernán Ramírez | Revocado | Sin participación en el período vigente. |
| Jorge Ángel Páez | Revocado | Sin participación en el período vigente. |
| Lupe Dávalos | Sin estado de acceso | Registro incompleto; no integra el padrón operativo activo. |
| Martín Mainardi | Revocado | Sin participación en el período vigente. |
| Mauricio Amaya | Revocado | Existe además el registro activo de Mauricio Amaya. No debe duplicar consolidaciones. |
| Rodolfo Augusto Thumann | Revocado | Sin participación en el período vigente. |

## Prioridad de corrección

### Prioridad 1 — impacto directo en facturación

1. Corregir la regla de apertura revisada que excluye compras del mismo día.
2. Recalcular David con sus compras válidas posteriores a la apertura. Juan
   queda fuera del alcance de la corrección solicitada en esta instancia.
3. Mantener los cinco payouts de Lore pendientes hasta que ella confirme el
   cobro; recién entonces se aplicarán al flotante por el flujo normal.
4. Recalcular el consolidado y el ranking después de los puntos
   anteriores.

### Prioridad 2 — operaciones perdidas o no asignadas

1. Resolver los 915 recibos pendientes de Javier y verificar si contienen
   operaciones económicas recuperables.
2. Reconstruir los 22 lotes de Leonardo.
3. Revisar los lotes de Julián, Baltazar, Felipe y Franco contra telemetría.

### Prioridad 3 — estados de cuentas

Validar las cuentas cerradas sin operaciones de Baltazar, Felipe, Javier y Lore.
Si fueron quemas reales, debe registrarse la evidencia y el resultado correcto;
si fueron cierres automáticos falsos, deben reabrirse sin inventar movimientos.

## Conclusión

El panel no puede considerarse completamente confiable todavía. Alejandro
Cambieri y Franco ya tienen resultados explicables bajo la regla correcta de
payout y flotante. La lectura de David y Lore queda corregida; Juan conserva
una diferencia pendiente fuera del alcance autorizado en esta instancia.
Javier y Leonardo presentan fallas técnicas con evidencia de actividad no
registrada. El resto se divide entre usuarios sin actividad, pendientes menores
y usuarios aún no configurados.
