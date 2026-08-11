# Matriz de carga agil

- Version: `0.1`
- Fecha: `2026-08-10`
- Propietario: `Producto y Tecnologia`
- Estado: `Propuesta para validacion funcional`
- Depende de: `04_MAPA_FUNCIONAL_DE_LA_APP.md` y `06_PRIORIZACION_DE_PANTALLAS.md`

## Proposito

Definir, antes de disenar formularios definitivos, que informacion debe cargar
el alumno y que informacion debe completar NODAL App.

El criterio obligatorio es:

> Para un resultado equivalente, la app pedira la misma cantidad o menos de
> carga manual que Sheets. Un campo manual nuevo requiere justificacion y
> aprobacion funcional.

## Criterios de diseno

1. La app no pedira un dato que ya exista en otro registro confiable.
2. La app no pedira al alumno que realice un calculo.
3. Un campo solo aparecera cuando sea necesario para la accion elegida.
4. Un dato automatico debe poder explicarse y corregirse con trazabilidad.
5. Si una fuente externa confiable puede aportar un dato, la carga manual sera
   el respaldo, no el camino obligatorio.
6. Si una regla no esta documentada, no se inventara un formulario para ella.

## 1. Compra de cuenta

| Dato | Situacion actual en Sheets | Comportamiento propuesto en la app | Carga del alumno |
|---|---|---|---|
| Numero de compra | Se calcula consecutivamente. | Se genera automaticamente. | Ninguna. |
| Fecha de compra | Se registra automaticamente. | Se propone la fecha actual y se permite corregirla si la compra fue anterior. | Solo correccion cuando corresponda. |
| Empresa | Se selecciona desde una lista. | Se selecciona desde una lista administrada por NODAL. | Seleccion unica. |
| Referencia | Se calcula de forma consecutiva por empresa. | Se genera y muestra automaticamente al guardar. | Ninguna. |
| Estado de cuenta | Se deriva de la informacion operativa. | Se calcula en el servidor. La compra inicia virgen. | Ninguna. |
| Precio | Vigente como dato manual. | Se solicita una vez al crear la compra. | Importe unico. |
| Origen de fondos | Es un dato clasificado. | Se solicita una vez con opciones claras. | Seleccion unica. |
| Resultado bruto | Se calcula desde Registro de Operaciones. | Se calcula y se muestra como informacion. | Ninguna. |
| Usuario, fecha de registro y correcciones | Se distribuyen entre formulas y procesos. | Se guardan automaticamente en la auditoria. | Ninguna. |

### Resultado esperado

Para crear una cuenta, el alumno solo debera informar:

1. empresa;
2. precio;
3. origen de fondos;
4. fecha, solo si difiere de la propuesta por la app.

La referencia, el numero de compra, el estado inicial, el resultado y la
trazabilidad no seran campos de carga.

## 2. Control diario

El Control Diario debe registrar la fecha real de actividad. La app debe evitar
que el alumno complete simultaneamente datos que se pueden deducir entre si.

| Dato | Situacion actual en Sheets | Comportamiento propuesto en la app | Carga del alumno |
|---|---|---|---|
| Fecha operativa | Se conserva como fecha real. | Se propone la fecha actual y se permite editar. | Solo correccion cuando corresponda. |
| Numero de operacion | Se calcula consecutivamente. | Se genera automaticamente. | Ninguna. |
| Tipo de registro | Deposito, retiro o actualizacion de saldo. | El alumno elige una accion comprensible. | Seleccion unica. |
| Movimiento de fondos | Se carga cuando existe deposito o retiro. | Aparece solo si se eligio movimiento. | Importe unico, cuando corresponda. |
| Saldo actual | Puede cargarse o calcularse segun el movimiento. | El alumno informa saldo actual **o** movimiento; la app no exige ambos. Una integracion futura podra completarlo. | Un importe, segun la accion elegida. |
| Resultado | Se calcula contra el saldo anterior. | Se calcula automaticamente. | Ninguna. |
| Empresa | Se selecciona. | Se ofrece desde las empresas vigentes. Cada empresa conserva su propia serie de cuentas. | Seleccion unica. |
| Cuenta lider | Se selecciona. | Se filtra segun la empresa elegida y reutiliza cuentas compradas. Se elige separada de las replicas. | Seleccion unica. |
| Fase | Se selecciona desde fases conocidas. | Se presenta solo despues de elegir cuenta lider. | Seleccion unica. |
| Origen o destino | Clasifica el movimiento. | Se solicita solo para un movimiento externo que lo requiera. | Seleccion condicional. |
| Observaciones | Campo libre. | Opcional; no bloquea el registro. | Opcional. |
| Check de carga | Marca manualmente que el trader ya traslado esa operacion al Registro de Operaciones. | Se reemplaza por la confirmacion que genera los registros automaticamente, junto con su auditoria. | Ninguna. |

### Regla de simplificacion clave

El alumno no debera ingresar saldo y movimiento para describir el mismo hecho.

- Si informa un deposito o retiro, la app calcula el saldo resultante cuando
  cuenta con el saldo anterior.
- Si informa un saldo nuevo, la app calcula la diferencia contra el saldo
  anterior.
- Si la fuente broker entrega un saldo confiable, la app lo muestra y registra
  su origen; el alumno solo interviene ante una correccion justificada.

## 3. Registro de operaciones por cuenta

Las fases conocidas son Evaluacion y Primera a Quinta vuelta. La informacion
exacta que se carga dentro de cada fase pertenece a Operaciones y no esta
documentada con detalle suficiente para cerrar este formulario.

| Dato | Comportamiento propuesto en la app | Carga del alumno |
|---|---|---|
| Empresa | Se reutiliza desde la cuenta seleccionada. | Ninguna. |
| Cuenta | Se elige desde las cuentas existentes. | Seleccion unica. |
| Estado actual | Se calcula y se muestra antes de editar. | Ninguna. |
| Fase | Se selecciona desde las fases permitidas. | Seleccion unica. |
| Informacion de la fase | Solo se solicitara cuando Operaciones defina los campos y reglas exactos. | Pendiente de definicion. |
| Arrastre negativo | Se calcula desde el total de la fase anterior. | Ninguna. |
| TOTAL GANANCIA | Se calcula con la regla definida. | Ninguna. |
| Estado resultante | Se calcula en el servidor. | Ninguna. |
| Replica | Se aplica desde un grupo registrado explicitamente. | Al confirmar el Control Diario se genera un registro por cada cuenta seleccionada; no se vuelve a cargar para cada replica. |
| Usuario, fechas y correcciones | Se registran en auditoria. | Ninguna. |

### Limite actual

No se diseniara la grilla o los campos internos de una fase hasta que
Operaciones confirme su significado, entradas y resultados. Esto evita crear
una pantalla bonita que obligue al alumno a cargar datos incorrectos o de mas.

## 4. Resumen y progreso

El resumen no debe pedir carga al alumno. Debe explicar lo ya registrado.

| Informacion | Fuente en la app | Carga del alumno |
|---|---|---|
| Estados de cuenta | Compras y operaciones guardadas. | Ninguna. |
| Saldo broker | Control Diario o integracion autorizada. | Solo respaldo manual cuando sea necesario. |
| Billetera, retiros y movimientos externos | Registros especificos del Nivel 2. | No corresponde al primer recorrido. |
| Resultado semanal y mensual | Calculos deterministas. | Ninguna. |
| Resultado bruto y ganancia realizada | Operaciones y estados. | Ninguna. |
| Comision estimada | Regla vigente del sistema. | Ninguna. |
| Alertas | Validaciones y conciliaciones. | Ninguna. |

## 5. Reglas de experiencia para todas las pantallas

- Guardar una accion debe requerir un solo paso claro.
- Los campos obligatorios se limitaran a los indispensables.
- Las listas ofreceran opciones ya conocidas, en lugar de pedir texto repetido.
- La app recordara el contexto elegido durante la tarea: modalidad, periodo,
  empresa y cuenta cuando corresponda.
- Los mensajes explicaran que falta y como resolverlo, sin lenguaje tecnico.
- Una correccion mostrara que se esta corrigiendo un dato anterior y conservara
  el historial.
- La carga manual sera siempre posible cuando una integracion falle, pero no se
  presentara como tarea duplicada.

## Pruebas de carga agil

Antes de aprobar una pantalla, se verificara que:

1. un alumno puede completar la accion sin consultar otra pantalla para copiar
   datos ya existentes;
2. no debe repetir empresa, referencia, cuenta o fecha sin necesidad;
3. no debe calcular resultados, estados ni saldos derivados;
4. el numero de pasos manuales no supera el equivalente en Sheets;
5. los datos opcionales no bloquean el registro;
6. el resultado conserva trazabilidad y coincide con un caso de Sheets;
7. si se integra una fuente externa, la app indica claramente fecha, origen y
   estado de sincronizacion.

## Pendientes antes de cerrar los formularios

- Contabilidad debe confirmar los campos obligatorios definitivos de Control
  Diario y el significado operativo de Saldo Actual.
- Operaciones debe definir los campos y las validaciones de cada fase.
- Debe verificarse la fuente remota vigente antes de portar una formula o rango
  concreto de Sheets.
- Deben prepararse casos anonimizados para medir cantidad de cargas y resultado.

## Siguiente paso propuesto

Actualizar el prototipo visual con Control Diario y, una vez que Operaciones
defina sus campos, con Registro de Operaciones por cuenta. La revision del
prototipo debera comprobar la carga agil antes de pasar a arquitectura.
