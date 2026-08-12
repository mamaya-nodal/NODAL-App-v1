# Mapa de migracion: Registro de Operaciones

- Version: `0.1`
- Fecha: `2026-08-10`
- Propietario: `Producto y Tecnologia`
- Estado: `Base funcional para validacion`
- Alcance: registro por cuenta, fases, arrastre, estado y replicas.

## Proposito

Definir como NODAL App debe representar el Registro de Operaciones vigente sin
copiar rutas operativas confidenciales ni inventar campos nuevos para el alumno.

Este registro debe dejar de ser una segunda carga obligatoria despues de Control
Diario. Debe recibir los datos que la app ya conoce, permitir verificarlos y
corregirlos con trazabilidad.

## Fuentes consultadas

1. `Registro de Operaciones` de la Plantilla Maestra Nodal, rango operativo
   `A1:F70` y panel de cuenta `H:K`.
2. `../NODAL-Contabilidad-Gestion-v1/docs/02_MODELO_OPERATIVO_PARA_REGISTRO.md`.
3. `../NODAL-Contabilidad-Gestion-v1/docs/12_MAPA_TECNICO_PLANTILLA_MAESTRA.md`.
4. `../NODAL-Operaciones-v1/docs/02_CUENTAS_FASES_REPLICAS_Y_FECHAS.md`.
5. `docs/08_MAPA_DE_MIGRACION_CONTROL_DIARIO.md`.

## Hechos vigentes

### Fases y estructura actual

La plantilla contiene seis etapas: `Evaluacion`, `Primera vuelta`, `Segunda
vuelta`, `Tercera vuelta`, `Cuarta vuelta` y `Quinta vuelta`.

- Cada etapa conserva fecha y datos de trades.
- Evaluacion contiene `NETO BROKER +` y `NETO BROKER-`.
- Las vueltas posteriores contienen `NETO PROP`, `NETO BROKER +` y
  `NETO BROKER -`.
- Cada etapa calcula `GANANCIA / PERDIDA` y `TOTAL GANANCIA`.
- En las vueltas posteriores existe tambien `TOTAL RETIRO`.

Los `TOTAL GANANCIA` se encuentran al cierre de cada etapa. Esos totales y los
datos operativos determinan el estado de la cuenta.

### Arrastre entre fases

Regla vigente:

- un total negativo se arrastra como `NETO BROKER -` a la siguiente etapa;
- un total positivo no se arrastra.

Esta regla debe ejecutarse en un servicio de negocio del backend, no en la
interfaz.

### Estados de cuenta

Regla vigente compartida con Contabilidad:

1. sin datos operativos: `Cuenta virgen`;
2. con datos operativos y sin ningun total positivo: `Cuenta viva`;
3. con algun `TOTAL GANANCIA` positivo: `Cuenta cerrada`.

El precio de una compra no convierte por si solo una cuenta en viva.

### Lider y replicas

Las replicas solo existen cuando fueron seleccionadas expresamente. Comparten
la informacion replicada de la lider y deben quedar en el mismo estado
resultante. La numeracion consecutiva nunca prueba una replica.

## Migracion aprobada desde Control Diario

Al confirmar una operatoria en Control Diario, la app creara una entrada por
cada cuenta participante, dentro de la fase elegida y vinculada al control que
la origino.

Para un resultado broker positivo, el importe distribuido se registra en
`NETO BROKER +` de cada cuenta participante. La fecha operativa proviene de
Control Diario; no de la hora en que el usuario consulta o corrige el registro.

Ejemplo confirmado:

| Control Diario | Distribucion | Resultado creado |
|---|---|---|
| Lider 01; replicas 04, 07 y 08; resultado USD 500 | USD 125 por cuenta | Cuatro entradas `NETO BROKER +` de USD 125 en la fase indicada |

Registro de Operaciones se vuelve una vista de consulta y correccion de esas
entradas, no un segundo formulario que el alumno deba completar desde cero.

## Informacion que debe conservar cada entrada derivada

| Dato | Origen | Estado |
|---|---|---|
| Alumno, modalidad y periodo | Contexto autenticado y seleccionado | Confirmado |
| Empresa y cuenta | Seleccion explicita en Control Diario | Confirmado |
| Fase | Seleccion explicita en Control Diario | Confirmado |
| Fecha operativa | Control Diario | Confirmado |
| Importe y sentido | Resultado distribuido | Confirmado para resultado positivo |
| Rol de cuenta | Lider o replica | Confirmado |
| Control Diario de origen | Vinculo interno | Confirmado |
| Usuario, fecha de confirmacion y correcciones | Auditoria | Confirmado |
| N° trade, Trade Prop y Neto Prop | Regla o fuente operativa aun no documentada completamente | Pendiente de Operaciones |
| Tratamiento del resultado negativo | Resultado economico con signo negativo; magnitud positiva en `NETO BROKER -` y arrastre absoluto si la fase termina negativa | Confirmado por formulas vigentes |
| Formula detallada de retiros por vuelta | Regla de negocio vigente | Pendiente de validacion funcional antes de portar |

## Comportamiento de pantalla propuesto

La pantalla no debe copiar la grilla de 70 filas de Sheets. Debe mostrar una
cuenta a la vez con sus fases y entradas reales.

1. El alumno selecciona empresa y cuenta, o llega desde un registro creado en
   Control Diario.
2. Ve el estado actual de la cuenta y el motivo que lo determina.
3. Ve cada fase como una seccion con sus entradas, totales y arrastre recibido.
4. Cada entrada indica si fue creada desde Control Diario o si fue corregida.
5. Las replicas muestran el mismo origen operativo, pero conservan su propia
   identidad y auditoria.
6. Los totales, estado y resumen se recalculan en el servidor despues de cada
   cambio aprobado.

Esta es una propuesta de presentacion. Las reglas de calculo y los campos
habilitados siguen dependiendo de las fuentes propietarias.

## Correcciones y trazabilidad

### Confirmado

- El usuario debe poder revisar y corregir una entrada generada.
- La fecha operativa original debe conservarse.
- El valor corregido reemplaza al anterior en la vista y los calculos; la
  version previa queda solo en la auditoria interna.
- No se pierde el vinculo a Control Diario.
- El estado, los totales y el resumen deben actualizarse de forma consistente.
- Una edicion particular por cuenta no se confirma si la suma distribuida deja
  de coincidir con el resultado total del Control Diario.

### Pendiente antes de implementar

1. Definir el detalle visual del ajuste excepcional por cuenta y su motivo.
2. Definir el cierre manual excepcional de una cuenta viva con resultado
   negativo: permisos, motivo y efectos.
3. Definir la informacion exacta de cada fase que puede quedar visible sin
   exponer rutas operativas confidenciales.

## Pendientes de equivalencia

1. Confirmar los datos necesarios para que una entrada automatica sea completa
   en cada fase, sin pedir al alumno una segunda carga innecesaria.
2. Preparar casos anonimizados para cada fase, con resultado esperado.

## Casos de prueba obligatorios

| Caso | Resultado esperado |
|---|---|
| Cuenta nueva sin operaciones | Sigue `Cuenta virgen`. |
| Control Diario positivo en Evaluacion | Crea `NETO BROKER +`, calcula total y cambia a `Cuenta viva` o `Cuenta cerrada` segun las reglas completas. |
| Resultado negativo de una fase | Se registra y se arrastra a la fase siguiente segun la regla vigente. |
| Total positivo | No se arrastra a la etapa siguiente y la cuenta queda `Cuenta cerrada`. |
| Lider con replicas no consecutivas | Crea entradas equivalentes solo para las cuentas seleccionadas. |
| Correccion de entrada derivada | Conserva auditoria, recalcula totales y evita inconsistencias con Control Diario. |
| Dos empresas con cuenta 01 | No mezcla cuentas, totales ni replicas. |

## Criterio de cierre de este mapa

El mapa estara listo para orientar el backend cuando Operaciones confirme los
campos de fase, Contabilidad valide la portacion de formulas y Apps Script sea
comparado con casos conocidos. Hasta entonces no se implementaran rutas ni
formularios adicionales que no esten justificados por una regla vigente.

El siguiente mapa propuesto es `Resumen Operativo y Conciliaciones`, porque
recibe los resultados de compras, Control Diario y Registro de Operaciones.

## Estado tecnico inicial

La base de desarrollo crea una entrada derivada por cuenta al confirmar Control
Diario, conservando fase, fecha, rol, destino, importe y vinculo de origen. La
interfaz ya muestra esas entradas en una vista de solo lectura filtrada por
empresa y cuenta, sin exigir una segunda carga al alumno.

La vista muestra subtotales de `NETO BROKER +`, `NETO BROKER -` y resultado
broker visible. No denomina a este subtotal `TOTAL GANANCIA`, porque todavia no
incluye todos los componentes de las vueltas. Tampoco permite correcciones ni
actualiza estados en esta etapa.

El servicio de estado de cuenta tambien conserva la regla vigente: sin datos
operativos es virgen; con actividad y sin `TOTAL GANANCIA` positivo es viva; con
algun `TOTAL GANANCIA` positivo es cerrada. No se conecto aun a PostgreSQL
porque las entradas broker aisladas no bastan para reconstruir todos los
componentes de `TOTAL GANANCIA` en cada fase. Actualizar el estado con una suma
parcial produciria una equivalencia falsa con Sheets.

La verificacion de solo lectura sobre `PLANTILLA_LIMPIA!A1:F70` confirmo que
`TOTAL GANANCIA` usa las magnitudes de `NETO BROKER +`, `NETO BROKER -` y, en
las vueltas, `TOTAL RETIRO`. Un total negativo se convierte en el arrastre de
la fase siguiente. Este calculo contable y el arrastre ya estan codificados y
probados en centavos enteros.

La formula que produce `TOTAL RETIRO` contiene parametros operativos especificos
y no se copio al repositorio. Su portacion requiere aprobacion expresa y casos
anonimizados de equivalencia. La Plantilla Maestra fue consultada solamente en
lectura y no recibio cambios.
