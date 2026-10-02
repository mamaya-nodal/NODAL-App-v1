# Reglas unificadas de detección de cuentas desde Ninja

## Propósito

Este documento define las reglas que NODAL App deberá usar para detectar, clasificar y enlazar cuentas a partir de lo observable en Ninja. Su propósito es preservar continuidad contable y operativa dentro de NODAL, no reproducir procesos internos de las prop firms.

Alcance actual: programas de US$50.000. Los prefijos de cada empresa y estado operativo se mantienen en la matriz comparativa de empresas.

## Datos que la aplicación puede usar

- Prefijo y nombre externo de la cuenta informado por Ninja.
- Aparición y desaparición de cuentas en el inventario de Ninja.
- Saldo informado por Ninja y sus cambios en el tiempo.
- Primera fecha en que NODAL observa la cuenta. Se propone como fecha de compra y el alumno puede corregirla antes de confirmar el registro económico.
- Saldo cerrado al final de cada jornada (EOD), cuando aplique.
- Saldo inicial del programa.

La aplicación no debe basar sus decisiones en contratos, botones internos de la firma, cantidad de payouts, decisiones de Risk Team, identificadores internos del alumno ni procedimientos de retiro. Esos datos no son necesarios para la detección acordada.

## Conceptos internos de NODAL

| Concepto | Uso en NODAL |
| --- | --- |
| Estado operativo | CE: Evaluation; CF: Funded; CL: Live. Se determina por el prefijo de la empresa. |
| Estado contable | Virgen, viva o cerrada. |
| Fase NODAL | Evaluación, Primera vuelta, Segunda vuelta y siguientes. |
| Vida NODAL | Identificador interno que evita sobrescribir historial cuando Ninja reutiliza o cambia el nombre de una cuenta. Una misma etiqueta externa puede representar más de una vida. |
| Emparejamiento | Enlace interno entre dos vidas para mantener continuidad económica. No afirma que Ninja conserve un identificador único entre fases. |

## Reglas comunes de cuenta de evaluación (CE)

- Saldo inicial: **US$50.000**.
- Piso de quema inicial: **US$48.000**.
- Objetivo de pase: **US$53.001** o superior.
- La quema ocurre automáticamente cuando el saldo toca el piso vigente.
- Dentro de una misma jornada, el piso no se mueve.
- Al cierre de la jornada, el piso del día siguiente pasa a ser el mayor saldo cerrado EOD histórico menos US$2.000. Nunca baja.

Ejemplos:

- Máximo EOD histórico de US$50.000: piso siguiente de US$48.000.
- Máximo EOD histórico de US$50.100: piso siguiente de US$48.100.
- Si una jornada cierra en US$49.700, pero el máximo EOD previo era US$51.500, el piso permanece en US$49.500.

### CE a CF: detección y enlace automático

Cuando, dentro de un mismo evento de inventario, desaparecen cuentas CE y aparecen cuentas CF:

1. Una CE que alcanzó US$53.001 y no tocó su piso vigente es candidata a continuar como CF.
2. Una CE que tocó su piso vigente se clasifica como cerrada por quema.
3. Si cantidades, saldos o estados operativos son inconsistentes, se genera una alerta para revisión.
4. Si los candidatos y las cuentas CF aparecidas son coherentes, NODAL crea el enlace interno necesario para conservar el historial económico.

El semáforo operativo de una identidad no altera esta continuidad. Una cuenta CF
compatible conserva el destino contable de las CE que ya estaban adjudicadas a
esa identidad, alcanzaron el objetivo y siguen pendientes de transición. Una CE
histórica ya resuelta no se reutiliza. Si existen varios destinos compatibles,
la transición no se infiere y queda pendiente de revisión.

El enlace es determinista dentro de NODAL: no pretende afirmar que una etiqueta específica de CE corresponda de forma única a una etiqueta específica de CF en Ninja.

### Reset de CE

Si una CE desaparece y luego aparece otra CE con saldo inicial de US$50.000, se trata como un reset:

- Se cierra la vida anterior con motivo `reset`.
- Se crea una nueva vida NODAL CE, virgen, con saldo inicial US$50.000 y piso US$48.000.
- Se conserva el historial de la vida anterior.
- Si la vida anterior ya había tocado el piso vigente, primero queda registrada como quema y luego se registra el reset.

Esta regla aplica aunque Ninja reutilice el mismo nombre o presente un nombre diferente.

## Reglas comunes de cuenta funded (CF)

- Saldo inicial: **US$50.000**.
- Piso de quema inicial: **US$48.000**.
- La quema ocurre automáticamente cuando el saldo toca el piso vigente.

Para todas las empresas salvo Topstep:

- Al alcanzar **US$52.100** en tiempo real, el piso sube a **US$50.100** en tiempo real.

Excepción Topstep:

- Al alcanzar **US$52.000** en tiempo real, el piso sube a **US$50.100** en tiempo real.

## CF a CL: confirmación humana obligatoria

Cuando una o más CF desaparecen y aparece una o más CL durante el mismo evento de inventario:

- NODAL muestra una notificación con las cuentas candidatas.
- El usuario debe confirmar el enlace entre CF y CL.
- Solo después de esa confirmación NODAL une los historiales.

Si aparece una CL sin una CF compatible que haya desaparecido, NODAL registra la cuenta live detectada y solicita su origen. No debe inventar un emparejamiento.

## Reglas de cuenta live (CL)

- El estado operativo Live se clasifica por prefijo.
- Si una CL desaparece, NODAL notifica al usuario y solicita que indique qué ocurrió.
- En esta etapa no se infiere automáticamente quema, retiro, reset ni ninguna otra causa de desaparición.

## Pendientes antes de programar el motor definitivo

1. Definir qué campo exacto de Ninja será el saldo de referencia para estas comparaciones.
2. Definir la ventana temporal que agrupa apariciones y desapariciones dentro de un mismo evento.
3. Diseñar la notificación y confirmación manual para CF a CL.
4. Validar estas reglas con inventarios y saldos reales de cada empresa antes de habilitarlas en producción.

## Estado de esta especificación

Las reglas y valores anteriores son decisiones confirmadas para el alcance actual. Los cuatro puntos finales siguen abiertos y no deben completarse por suposición.
