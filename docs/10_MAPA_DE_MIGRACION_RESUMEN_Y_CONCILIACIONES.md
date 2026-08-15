# Mapa de migracion: Resumen Operativo y Conciliaciones

- Version: `0.1`
- Fecha: `2026-08-10`
- Propietario: `Producto y Tecnologia`
- Estado: `Base funcional para validacion`
- Alcance: resumen del alumno, progreso de capital, conciliaciones, comision y
  cortes semanales.

## Proposito

Definir como la app debe conservar toda la informacion actual de Resumen
Operativo, sin transformarla en una copia literal de celdas ni pedir carga
manual adicional al alumno.

El resumen es el lugar donde el alumno puede entender el progreso de su capital
y comprobar que los movimientos, las cuentas y los resultados son consistentes.

## Fuentes consultadas

1. `Resumen Operativo` de la Plantilla Maestra Nodal, bloques y formulas
   vigentes.
2. `../NODAL-Contabilidad-Gestion-v1/docs/01_MODELO_ECONOMICO_Y_CONCILIACIONES.md`.
3. `../NODAL-Contabilidad-Gestion-v1/docs/12_MAPA_TECNICO_PLANTILLA_MAESTRA.md`.
4. `docs/04_MAPA_FUNCIONAL_DE_LA_APP.md`.
5. Decisiones funcionales confirmadas en este hilo.

## Decision de producto confirmada

Resumen Operativo no desaparece ni es reemplazado por Inicio.

- **Inicio** mostrara una sintesis de los datos actuales y las acciones que
  requieran atencion.
- **Resumen** sera una seccion propia con el detalle completo, explicable y
  trazable de los valores que hoy presenta la planilla.

La primera version no elimina metricas existentes. Cualquier simplificacion
posterior requiere validar que el alumno y NODAL no pierdan capacidad de
reconstruir el capital o conciliar diferencias.

## Principios que deben preservarse

### Capital, flujo de caja y resultado son distintos

| Dimension | Significado | No debe confundirse con |
|---|---|---|
| Capital | Recursos propios incorporados por el trader, incluso compras iniciales financiadas por el trader. | Ganancia o saldo disponible. |
| Flujo de caja | Movimientos entre broker, billetera, compras y retiros. | Resultado operativo. |
| Resultado | Ganancia o perdida producida por la operatoria. | Un deposito, retiro o traslado. |

Un resumen correcto mantiene esas tres dimensiones separadas y permite conocer
el origen de cada valor.

### El resumen es calculado

Ninguna cifra del resumen debe solicitarse manualmente al alumno si ya puede
obtenerse de Compras, Control Diario, Registro de Operaciones, movimientos de
billetera o retiros.

Cada cifra debe conservar modalidad, periodo, fecha de calculo, registros que
la componen y estado de conciliacion.

## Bloques actuales que deben migrarse

| Bloque actual | Informacion vigente | Fuente principal en la app |
|---|---|---|
| Situacion actual | Saldo broker, saldo billetera, retiros pendientes y posicion observable. | Controles diarios, movimientos externos y retiros. |
| Resultado y capital | Capital neto aportado, resultado acumulado, posicion esperada y diferencia de conciliacion. | Capital, flujos y resultados calculados. |
| Estado operativo | Cuentas virgenes, vivas y cerradas; flotante de cobertura. | Compras y Registro de Operaciones. |
| Ganancia realizada y conciliacion | Ganancia de cuentas cerradas, ganancia conciliada, resultado del periodo, flotante de cuentas vivas, precio de cuentas virgenes y diferencia de ganancias. | Resultado por cuenta y estados. |
| Comision y ganancia trader | Comision de mesa y ganancia estimada del trader. | Ganancia realizada de cuentas cerradas y regla de comision. |
| Resultado semanal | Compras, resultado broker, retiros aprobados y resultado semanal. | Registros fechados del periodo. |
| Posicion semanal | Saldo broker, billetera, pendientes, cuentas vivas, flotante y diferencia de cada cierre. | Snapshot calculado al cierre de semana. |
| Movimientos externos de billetera | Fecha, tipo, importe y observaciones. | Registros especificos de movimiento. |
| Retiros de fondeo | Fecha de aprobacion, empresa, cuenta, importe, cobrado y fecha de cobro. | Registros de retiros. |

## Presentacion propuesta

### Inicio

Inicio mostrara solo valores de lectura inmediata:

- saldo broker y su fecha de actualizacion;
- resultado del periodo;
- estado de capital y conciliaciones;
- cuentas virgenes, vivas y cerradas;
- alertas o acciones pendientes.

Cada bloque llevara al detalle correspondiente de Resumen. Inicio no muestra
una cifra sin contexto si existe una diferencia o un dato desactualizado.

### Resumen

La seccion Resumen se organizara en estos grupos:

1. situacion actual;
2. capital y resultado;
3. cuentas y estado operativo;
4. ganancia realizada, comision y conciliaciones;
5. evolucion semanal;
6. movimientos externos y retiros de fondeo.

Cada indicador tendra una explicacion breve, fecha de calculo y acceso a los
registros que lo componen. Esta es una propuesta de presentacion; no modifica
formulas ni reglas vigentes.

## Reglas de calculo vigentes

### Resultado por cuentas y conciliacion de ganancias

La ganancia realizada de cuentas cerradas es la suma del resultado bruto de las
cuentas cuyo estado es `Cuenta cerrada`.

La conciliacion vigente compara esa ganancia con:

`resultado del periodo + flotante de cuentas vivas + precio de cuentas virgenes`.

La diferencia esperada es cero. Una diferencia distinta de cero es una alerta
de conciliacion: no se corrige automaticamente ni habilita a alterar la regla.

### Conciliacion de capital

Compara la posicion observable con la posicion esperada segun capital aportado
y resultado acumulado. Una diferencia distinta de cero requiere revision.

La app debe mostrar ambos valores, la diferencia, los registros incluidos y el
estado de la revision.

### Comision de mesa y ganancia trader

La base actual es la ganancia realizada de cuentas cerradas.

| Base de ganancia realizada | Comision estimada |
|---|---|
| Menor o igual a USD 0 | USD 0 |
| Menor a USD 10.000 | 50%, con techo de USD 4.400 |
| Desde USD 10.000 y menor a USD 15.000 | 40%, con techo de USD 5.500 |
| Desde USD 15.000 y menor a USD 35.000 | 35% |
| Desde USD 35.000 | 25% |

La ganancia estimada del trader es:

`MAX(ganancia realizada, 0) - comision estimada de mesa`.

La app debe marcar estos importes como estimados durante el periodo, mostrar su
base y tramo aplicado, y excluir administradores del calculo.

## Origen y actualizacion de los valores

| Valor | Se actualiza cuando | Origen que debe mostrarse |
|---|---|---|
| Saldo broker | Se confirma un Control Diario de saldo o movimiento. | Control Diario, fecha operativa y carga o integracion futura. |
| Estados y resultado bruto de cuenta | Se crea o corrige una entrada operativa. | Registro de Operaciones y control de origen. |
| Cuentas por estado y precios virgenes | Cambian compras o estados. | Compras y Registro de Operaciones. |
| Ganancia realizada y comision | Cambian resultados o estados de cuentas. | Cuentas cerradas y regla de comision vigente. |
| Saldo billetera y pendientes | Se registra un movimiento o retiro. | Movimiento externo o retiro de fondeo. |
| Semanas | Se incorporan registros con fecha operativa. | Registros dentro del rango semanal. |
| Conciliaciones | Cambia cualquier componente incluido. | Detalle de valores y registros comparados. |

## Alertas y trazabilidad

El resumen debe alertar, sin ocultar datos, cuando exista:

- diferencia de conciliacion de capital o ganancias;
- saldo broker desactualizado;
- retiro aprobado aun no cobrado;
- cuenta con actividad incompleta;
- correccion posterior que afecte un valor ya mostrado;
- cierre de periodo o semana pendiente de revisar.

Una alerta debe mostrar motivo, fecha, responsable cuando aplique, estado y
enlace a los registros de origen.

## Pendientes antes de backend

1. Confirmar las formulas completas de posicion esperada y posicion observable
   al portar las reglas de Sheets y Apps Script.
2. Definir el procedimiento aprobado para cierres semanales y mensuales, y la
   forma de conservar snapshots historicos.
3. Definir permisos: que valores ve el alumno, que valores adicionales ve un
   administrador y cuales requieren restriccion.
4. Confirmar campos, flujo y validaciones de movimientos externos de billetera
   y retiros de fondeo.
5. Preparar casos anonimizados con conciliacion cero y con diferencia para
   probar alertas y explicaciones.

## Casos de prueba obligatorios

| Caso | Resultado esperado |
|---|---|
| Compra virgen sin actividad | Aumenta precio de cuentas virgenes; no cambia ganancia realizada. |
| Cuenta con actividad abierta | Cuenta viva y su flotante se muestra separado de ganancia realizada. |
| Cuenta cerrada con resultado | Aumenta ganancia realizada, actualiza comision y ganancia estimada. |
| Deposito o retiro | Actualiza capital o flujo correspondiente, sin registrarse como ganancia. |
| Retiro aprobado no cobrado | Figura como pendiente; no aumenta saldo billetera. |
| Retiro cobrado | Sale de pendientes y pasa a saldo billetera con fecha de cobro. |
| Diferencia de conciliacion | Se muestra alerta y detalle; no se ajusta sola. |
| Cambio de semana o periodo | Conserva fecha real y asigna cada registro al corte correcto. |

## Criterio de cierre de este mapa

Este mapa estara listo para orientar la implementacion cuando Contabilidad
valide las formulas que falten, los cortes y los casos de prueba. El siguiente
mapa sera el de Compras, movimientos de billetera y retiros, que completa las
fuentes de datos del resumen.

## Actualización de implementación: 2026-08-15

La primera versión completa del Resumen ya está implementada en la app de
desarrollo. Calcula capital neto, resultado del período, posición observable y
esperada, estados de cuenta, flotante, ganancia realizada, comisión, ganancia
estimada del trader y las dos diferencias de conciliación.

También incorpora registros auditados para movimientos de billetera y retiros
de fondeo. Un retiro se registra primero como aprobado y pendiente; al
confirmarse el cobro se incorpora al saldo de billetera sin borrar su fecha de
aprobación. Los cortes semanales/mensuales y snapshots siguen pendientes de la
validación propietaria, por lo que no se automatizan todavía.
