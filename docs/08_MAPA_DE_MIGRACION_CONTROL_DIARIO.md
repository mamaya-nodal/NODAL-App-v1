# Mapa de migracion: Control Diario

- Version: `0.1`
- Fecha: `2026-08-10`
- Propietario: `Producto y Tecnologia`
- Estado: `Base funcional para validacion`
- Alcance: Control Diario y su generacion automatica de registros por cuenta.

## Proposito

Definir que debe conservarse del Control Diario vigente y que mejora de flujo ya
fue aprobada para NODAL App. Este documento no define tecnologia, tablas de base
de datos ni reemplaza el analisis detallado de Apps Script.

La regla central es que el alumno registra una operatoria una sola vez. La app
calcula el resultado, muestra su distribucion y, con confirmacion explicita,
crea los registros por cuenta que hoy se cargan manualmente despues del mercado.

## Fuentes consultadas

1. `Control Diario` de la Plantilla Maestra Nodal, columnas Fecha a Origen /
   Destino y sus formulas vigentes.
2. `Registro de Operaciones` de la Plantilla Maestra Nodal, encabezados de la
   etapa de Evaluacion y campos `NETO BROKER +` y `NETO BROKER-`.
3. `docs/04_MAPA_FUNCIONAL_DE_LA_APP.md` y
   `docs/07_MATRIZ_DE_CARGA_AGIL.md`.
4. `../NODAL-Operaciones-v1/docs/02_CUENTAS_FASES_REPLICAS_Y_FECHAS.md`.
5. Decisiones funcionales confirmadas en este hilo.

## Estado actual de Sheets

### Hechos vigentes

Control Diario conserva estos datos: fecha, numero de operacion, deposito o
retiro, saldo actual, resultado, empresa, cuenta lider, fase, observaciones,
check de carga y origen o destino.

- El numero de operacion se calcula consecutivamente cuando existe deposito o
  retiro o saldo actual.
- Con un saldo nuevo y sin movimiento de fondos, el resultado es la diferencia
  respecto del ultimo saldo guardado.
- Con un deposito o retiro, el saldo se ajusta desde el ultimo saldo y esa fila
  no representa resultado operativo.
- `Origen / Destino` admite actualmente: `Aporte trader`, `Saldo billetera` y
  `Retiro personal`.
- El `Check de carga` no ejecuta una automatizacion: es una marca manual para
  saber que el trader ya traslado esa fila al Registro de Operaciones.
- Registro de Operaciones dispone de los campos `NETO BROKER +` y
  `NETO BROKER-` para la etapa de Evaluacion.

## Flujo vigente que debe preservarse

Durante el horario de mercado, el trader deja constancia de cada operatoria en
Control Diario. Al finalizar, usa esas filas para reconstruir manualmente las
operaciones en Registro de Operaciones y marca el check para no duplicarlas.

La app debe conservar el valor de este proceso: fecha real, resultado total,
lider, fase, cuentas participantes y trazabilidad. No debe conservar la doble
carga manual si puede producir el mismo resultado de forma verificable.

## Decision de producto confirmada

Para una operatoria, el alumno ingresara el Control Diario y vera una vista
previa antes de confirmar. Al confirmar:

1. se guarda el control diario;
2. se calcula y deja visible el resultado total;
3. se distribuye ese resultado entre la cuenta lider y las replicas elegidas;
4. se crean automaticamente los registros por cuenta;
5. cada registro queda vinculado al Control Diario que lo origino;
6. la app impide una segunda confirmacion que duplique esos registros;
7. Registro de Operaciones queda disponible para consulta y correccion trazable.

Esto es una mejora intencional respecto de Sheets. No cambia la informacion
economica que obtiene el sistema; elimina una tarea manual repetida.

### Preparacion previa y recepcion futura desde NinjaTrader

Empresa, cuenta lider, replicas y fase se preparan antes del siguiente saldo.
La configuracion queda visible como destino activo, pero cada confirmacion
conserva su propia copia: cambiarla despues no modifica operaciones anteriores.

Cuando NinjaTrader entregue un saldo, NODAL calculara el resultado contra el
ultimo saldo confirmado y mostrara una revision obligatoria con tres caminos:

1. confirmar y registrar;
2. cambiar cuentas o fase y volver a revisar;
3. informar un error de sincronizacion.

No existe una accion normal `dejar pendiente` ni una carga manual alternativa
para el mismo saldo. Mientras haya una recepcion sin resolver, otro saldo no se
incorpora al saldo de referencia ni puede confirmarse por encima de ella.

La contingencia exige clasificar el problema e indicar el saldo correcto. El
dato original recibido se conserva para auditoria, pero no participa de los
resultados vigentes. NODAL recalcula el resultado y vuelve a mostrar destino y
distribucion antes de confirmar. La carga manual fuera de este flujo queda
reservada para una futura politica de contingencia cuando la integracion no
entregue ningun dato.

## Datos y comportamiento de la app

| Elemento | Origen | Comportamiento en NODAL App | Estado |
|---|---|---|---|
| Fecha operativa | Alumno | Se propone la fecha actual y puede corregirse para preservar la fecha real. | Vigente |
| Deposito o retiro | Alumno, cuando existe | Se registra como movimiento de capital; no como resultado operativo. | Vigente |
| Saldo actual | Alumno, hasta integrar una fuente autorizada | Se compara con el ultimo saldo registrado y ajustado. | Vigente |
| Saldo inicial | Primer deposito registrado | No es un valor fijo: inicia el historial de saldo del trader. | Confirmado |
| Ultimo saldo registrado | Historial de controles y movimientos | La app lo muestra antes de calcular un resultado. | Confirmado |
| Resultado total | Calculo | `saldo actual - ultimo saldo ajustado` cuando no hubo movimiento de fondos en esa fila. | Vigente |
| Empresa | Alumno | Seleccion explicita; carga su propia serie de cuentas. | Confirmado |
| Cuenta lider | Alumno | Se elige separada de las replicas. | Confirmado |
| Replicas | Alumno | Seleccion visual explicita. No se infieren por numeracion consecutiva. | Confirmado |
| Grilla de cuentas | Sistema | Cada empresa tiene sus propios numeros correlativos; admite hasta 250 cuentas por empresa. | Confirmado |
| Fase | Alumno | Dropdown con Evaluacion y vueltas Primera a Quinta. | Vigente |
| Observaciones | Alumno | Campo opcional para conservar contexto operativo. | Vigente |
| Registros por cuenta | Sistema, tras confirmacion | Se generan desde la distribucion visible y quedan vinculados al control diario. | Confirmado |

## Regla de saldo y resultado

El saldo de referencia es un valor que evoluciona; no un deposito inicial fijo.

1. El primer deposito del trader establece el primer saldo de referencia.
2. Un deposito posterior aumenta el saldo de referencia.
3. Un retiro posterior lo reduce.
4. Ninguno de esos movimientos se registra como ganancia o perdida.
5. Un nuevo saldo informado sin movimiento se compara con el ultimo saldo
   ajustado para obtener el resultado de la operatoria.

| Evento | Saldo de referencia posterior | Resultado operativo |
|---|---:|---:|
| Deposito inicial de USD 5.000 | USD 5.000 | No corresponde |
| Saldo informado de USD 5.500 | USD 5.500 | +USD 500 |
| Retiro de USD 1.000 | USD 4.500 | No corresponde |
| Saldo informado de USD 4.700 | USD 4.700 | +USD 200 |

## Regla de lideres y replicas

La cuenta lider no es una replica y no debe aparecer dentro de la seleccion de
replicas. La seleccion final de cuentas participantes es:

`cuenta lider + replicas elegidas explicitamente`.

Por ejemplo, lider `01` y replicas `04`, `07` y `08` significan cuatro cuentas
participantes. Si el resultado total es USD 500, la vista previa muestra USD
125 por cuenta antes de permitir confirmar.

Los numeros correlativos solo ayudan a navegar la grilla. Nunca autorizan a
suponer que una cuenta intermedia participo.

## Creacion automatica de registros

### Comportamiento aprobado

La pantalla debe mostrar, antes de confirmar, una fila por cada cuenta:

| Cuenta | Rol | Resultado a registrar |
|---|---|---:|
| 01 | Lider | +USD 125 |
| 04 | Replica | +USD 125 |
| 07 | Replica | +USD 125 |
| 08 | Replica | +USD 125 |

La confirmacion crea esas filas como registros derivados. Cada una conserva al
menos: alumno, modalidad, periodo, fecha operativa, empresa, cuenta, fase,
importe, origen `Control Diario`, identificador del control y fecha de
confirmacion.

### Protecciones obligatorias

- La accion de confirmar debe ser idempotente: repetirla no puede duplicar
  registros.
- La vista previa debe usar exactamente las cuentas que se van a registrar.
- Una correccion posterior no puede borrar la historia original.
- Si falta una cuenta, fase o saldo requerido, no se permite confirmar.
- El resultado y la distribucion deben poder rastrearse desde Registro de
  Operaciones de vuelta al Control Diario.

## Correcciones

### Confirmado

Registro de Operaciones debe permitir verificar o corregir lo creado desde
Control Diario. La auditoria debe conservar quien corrige, cuando y por que.

Control Diario mostrara un historial de saldos cargados. Al seleccionar y
corregir uno, el valor vigente reemplazara al anterior en la vista y en los
calculos, y se recalcularan las entradas derivadas de la lider y de todas las
replicas participantes. La version previa solo se conservara en la auditoria
interna y no se sumara ni aparecera como una operacion duplicada.

Se permitira una edicion excepcional del resultado de una cuenta, pero no se
podra confirmar mientras la suma de resultados por cuenta sea diferente del
resultado total de Control Diario. La interfaz mostrara el importe faltante o
excedente y no compensara otra cuenta silenciosamente.

### Pendiente de definir antes de backend

- Como se informa una distribucion no igualitaria, si existiera un caso valido.
- Como se trata una cuenta que fue incluida y luego no correspondia.

No se implementara una correccion silenciosa mientras estas reglas no esten
validadas.

## Pendientes de equivalencia con Apps Script

1. Confirmar el comportamiento exacto de Apps Script al guardar y trasladar
   informacion entre Control Diario y Registro de Operaciones.
2. Identificar los campos adicionales obligatorios que el registro derivado
   necesita para cada fase, sin copiar rutas operativas confidenciales.
3. Confirmar si cada empresa puede tener menos de 250 cuentas y como se marca
   una cuenta no disponible en la grilla.
4. Preparar casos anonimizados de Sheets con resultado esperado.

El destino y signo del resultado negativo quedaron confirmados en
`docs/14_INVESTIGACION_PERDIDAS_CORRECCIONES_Y_REPLICAS.md`.

## Casos de prueba obligatorios

| Caso | Entrada | Resultado esperado |
|---|---|---|
| Primer deposito | USD 5.000 | Se establece el saldo inicial, sin resultado operativo. |
| Saldo con ganancia | Saldo previo USD 5.000; nuevo USD 5.500 | Resultado total +USD 500. |
| Retiro | Saldo previo USD 5.500; retiro USD 1.000 | Saldo de referencia USD 4.500, sin resultado. |
| Una cuenta | Lider 01; sin replicas; resultado +USD 500 | Un registro de +USD 500. |
| Replicas no consecutivas | Lider 01; replicas 04, 07, 08; resultado +USD 500 | Cuatro registros de +USD 125. |
| Empresas distintas | Cuenta 01 de FFF y cuenta 01 de LUCID | Selecciones y registros separados por empresa. |
| Confirmacion repetida | Mismo control confirmado dos veces | No se duplican registros. |
| Resultado negativo | Saldo previo USD 5.000; nuevo USD 4.500; cuatro cuentas | Resultado economico -USD 125 por cuenta y magnitud USD 125 en `NETO BROKER -` de cada una. |
| Correccion posterior | Control ya confirmado | Se conserva auditoria y no se pierde la version original. |

## Criterio de cierre de este mapa

Este mapa estara listo para orientar el backend cuando se resuelvan los
pendientes de Apps Script y correcciones, y cuando los
casos de prueba anonimizados coincidan con Sheets.

El siguiente mapa sera `Registro de Operaciones`, con el detalle de los campos
por fase que Operaciones autorice documentar.
