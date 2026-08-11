# Investigacion: perdidas, correcciones y replicas

- Fecha: `2026-08-10`
- Estado: hallazgos de solo lectura y decisiones funcionales confirmadas
- Fuentes: formulas de la Plantilla Maestra Nodal y copia local fechada
  `2026-07-28` de su Apps Script.

## Resultado de la investigacion

La regla del resultado negativo pudo recuperarse con precision. En cambio, el
sistema actual no contiene una politica de correcciones auditadas que pueda
migrarse literalmente: al guardar o replicar, reemplaza la copia anterior de
la cuenta. Por eso esa segunda respuesta no debe deducirse como si fuera una
regla vigente; requiere una decision para la app.

## 1. Resultado negativo: regla recuperada

### Control Diario

El resultado es una diferencia con signo:

`saldo actual - ultimo saldo de referencia`

Por ejemplo, si el saldo anterior era USD 5.000 y el nuevo saldo es USD 4.500,
Control Diario calcula `-500`.

### Distribucion entre cuentas

La app debera dividir el resultado total entre la lider y las replicas
seleccionadas. Si el total es `-500` y participaron cuatro cuentas, el resultado
economico de cada cuenta es `-125`.

Registro de Operaciones no guarda ese valor como `-125` dentro de la columna de
perdidas. Conserva su magnitud positiva `125` en `NETO BROKER -`; la formula del
total resta esa columna:

- Evaluacion: `NETO BROKER + - NETO BROKER -`;
- vueltas posteriores: suma de `NETO BROKER +`, menos suma de
  `NETO BROKER -`, mas el retiro calculado cuando corresponde.

Por lo tanto, la app debe distinguir entre:

- resultado economico: `-125`;
- importe almacenado como perdida broker: `125`;
- destino: `NETO BROKER -` de la fase seleccionada.

### Arrastre

Si el total final de una fase es negativo, la fase siguiente recibe su valor
absoluto en la fila `ANTERIOR` de `NETO BROKER -`. Si el total es cero o
positivo, no existe arrastre.

Ejemplo:

1. Evaluacion termina en `-125`.
2. Primera vuelta comienza con `125` en `ANTERIOR / NETO BROKER -`.
3. Ese importe participa como perdida previa en el total de la nueva fase.

La misma logica se repite entre las vueltas siguientes.

## 2. Que hace hoy el guardado de cuentas

Apps Script guarda cada cuenta en `BASE_DATOS` mediante una clave compuesta por
empresa y referencia. Para cada guardado conserva rangos, valores, formulas,
fecha de guardado y estado visible.

Antes de escribir la nueva version, elimina de la salida todas las filas que
tenian esa misma clave y luego escribe el estado actual. En consecuencia:

- funciona como una fotografia vigente de la cuenta;
- una correccion reemplaza la fotografia anterior;
- `BASE_DATOS` no conserva por si misma el historial de versiones corregidas.

Este comportamiento describe una limitacion tecnica de Sheets, no una regla
que la app deba reproducir. La app tiene la obligacion ya confirmada de
conservar trazabilidad y correcciones.

## 3. Que hace hoy la replica

El proceso actual:

1. toma como lider la empresa y cuenta visibles;
2. permite elegir solamente cuentas compradas de esa misma empresa;
3. excluye la cuenta lider;
4. elimina duplicados de la seleccion;
5. guarda primero la lider;
6. copia la fotografia completa de sus rangos hacia cada destino elegido;
7. reemplaza cualquier fotografia anterior de las cuentas destino;
8. adapta el precio de compra propio de cada cuenta destino.

La base actual no conserva una entidad explicita que diga que esas cuentas
formaron un grupo, ni registra una relacion permanente entre la lider y cada
replica. Tampoco define que debe ocurrir si la lider se corrige despues.

Por eso no puede afirmarse, a partir del sistema actual, que una correccion
posterior deba propagarse siempre, nunca o solo en ciertos casos.

## 4. Correccion de un saldo (decision confirmada)

Control Diario mostrara un historial de los saldos registrados. El alumno podra
seleccionar una carga anterior, corregirla y confirmar el nuevo valor.

En el uso normal de la app, el saldo corregido reemplazara al valor anterior:

- el historial operativo mostrara el valor vigente;
- los calculos no incluiran dos veces la misma carga;
- el resultado se recalculara desde el saldo corregido;
- se reescribiran los resultados vigentes de la lider y de todas las replicas
  participantes.

Aunque el alumno no necesite ver la version anterior, el backend conservara una
auditoria interna minima con el valor previo, el nuevo valor, quien lo cambio y
cuando. Esa auditoria no participa en saldos ni resultados y responde a la
regla obligatoria de trazabilidad del proyecto.

## 5. Ajuste excepcional por cuenta (decision confirmada)

Despues de la distribucion automatica se permitira editar el resultado particular
de una cuenta cuando la replica haya tenido una diferencia real. Sin embargo,
la app aplicara esta igualdad obligatoria:

`suma de resultados de todas las cuentas = resultado total de Control Diario`

Ejemplo valido:

1. resultado total: USD 500;
2. cinco cuentas;
3. una cuenta se corrige a USD 110;
4. las otras cuatro, en conjunto, deben sumar USD 390;
5. la confirmacion solo se habilita cuando las cinco vuelven a sumar USD 500.

Ejemplo invalido:

1. resultado total: USD 500;
2. cuatro cuentas conservan USD 100;
3. una cuenta se cambia de USD 100 a USD 110;
4. suma distribuida: USD 510;
5. la app muestra una diferencia de USD 10 y no permite confirmar.

La app no modificara automaticamente otra cuenta para ocultar esa diferencia.
Mostrara cuanto falta asignar o cuanto se excede. El alumno debera corregir la
distribucion o revisar el saldo total.

## 6. Cambios en el estado de los pendientes

| Tema | Estado anterior | Estado despues de investigar |
|---|---|---|
| Destino y signo de una perdida | Pendiente | Recuperado de las formulas vigentes. |
| Arrastre negativo | Conocido en general | Confirmado con formulas de todas las fases. |
| Guardado actual | Pendiente de revisar | Confirmado: reemplaza la fotografia anterior. |
| Replica actual | Pendiente de revisar | Confirmado: copia y reemplaza destinos; no conserva grupo explicito. |
| Correccion futura | Pendiente | Confirmada: reemplazo operativo del saldo, recalculo completo y auditoria interna. |
| Excepcion por cuenta | Pendiente | Confirmada con igualdad obligatoria entre total y suma distribuida. |

No se modifico la Plantilla Maestra, Apps Script ni ninguna hoja durante esta
investigacion.
