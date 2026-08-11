# Priorizacion de pantallas de NODAL App

- Version: `0.1`
- Fecha: `2026-08-10`
- Propietario: `Producto y Tecnologia`
- Estado: `Propuesta para validacion de producto`
- Depende de: `04_MAPA_FUNCIONAL_DE_LA_APP.md` y `05_MARCO_SAAS_PRIVADO.md`

## Proposito

Definir el orden en que se disenaran y construiran las pantallas de NODAL App.
La prioridad se determina por el valor para el alumno y por la necesidad de
probar equivalencia con Sheets; no por complejidad visual.

Cada pantalla se diseniara con el criterio de carga agil: para un resultado
equivalente, no puede exigir mas datos manuales que la planilla sin una
justificacion funcional aprobada. La prioridad favorece pantallas que eliminan
duplicaciones, reutilizan informacion existente y automatizan calculos fiables.

## Regla de prioridad

Una pantalla entra antes si permite que el alumno registre, reconstruya o
comprenda su capital, y si es necesaria para completar el primer recorrido de
equivalencia:

`comprar cuenta -> control diario -> guardar operacion -> actualizar estado y resultado -> ver resumen`.

## Nivel 0: acceso seguro

Estas pantallas no forman parte del calculo economico, pero son necesarias para
probar el SaaS privado sin datos productivos.

| Orden | Pantalla | Usuario | Proposito |
|---|---|---|---|
| 0.1 | Ingreso | Alumno / administrador | Iniciar sesion con Google. |
| 0.2 | Acceso no autorizado | Persona no habilitada | Explicar que el correo no tiene acceso y como solicitar ayuda. |
| 0.3 | Seleccion de espacio | Alumno | Elegir Real o Practica y el periodo permitido. |
| 0.4 | Primera bienvenida | Alumno | Explicar brevemente el espacio, la modalidad y los datos pendientes. |

No se necesitara registro publico ni recuperacion de contrasena propia: Google
gestionara la identidad y NODAL autorizara el acceso.

## Nivel 1: primer recorrido del alumno

Este es el primer conjunto que se diseniara como prototipo y, despues, se
implementara con datos de prueba anonimizados.

| Orden | Pantalla | Que resuelve | Resultado observable |
|---|---|---|---|
| 1.1 | Inicio del alumno | Mostrar situacion y tareas pendientes. | El alumno comprende en segundos su modalidad, periodo y acciones necesarias. |
| 1.2 | Cuentas | Consultar todas las cuentas del periodo. | Puede ver empresa, referencia, estado, precio y resultado bruto de cada cuenta. |
| 1.3 | Nueva compra de cuenta | Registrar una cuenta adquirida. | La cuenta queda virgen, con fecha, empresa, referencia, precio y origen de fondos. |
| 1.4 | Detalle de cuenta | Consultar una cuenta individual. | El alumno entiende su estado, fases registradas, resultado y correcciones. |
| 1.5 | Control diario | Registrar saldo y movimientos reales del broker. | El sistema conserva fecha operativa, movimiento, saldo, resultado, lider y fase. |
| 1.6 | Operacion por cuenta | Registrar y guardar informacion de una fase. | El sistema actualiza el resultado bruto y el estado de la cuenta. |
| 1.7 | Resumen de progreso | Explicar el efecto de los registros. | El alumno ve capital, resultado, cuentas vivas o cerradas y alertas basicas. |
| 1.8 | Historial de actividad | Mostrar que se registro y cuando. | Puede reconstruir sus acciones y distinguir carga original de correcciones. |

### Orden de uso esperado

```text
Ingreso -> Real o Practica -> Inicio
                           -> Nueva compra -> Detalle de cuenta
                           -> Control diario -> Operacion por cuenta
                           -> Resumen de progreso
```

El listado de cuentas sera siempre accesible desde el inicio. El detalle de
cuenta conectara compras, operaciones, estado y resultado para evitar que el
alumno tenga que buscar informacion en varias pantallas.

## Nivel 2: equivalencia mensual

Estas pantallas se incorporaran una vez que el Nivel 1 produzca los mismos
resultados que los casos de referencia de Sheets.

| Orden | Pantalla | Que incorpora |
|---|---|---|
| 2.1 | Grupos de replicas | Crear y consultar la relacion explicita entre lider y replicas. |
| 2.2 | Retiros de fondeo | Distinguir retiro aprobado, pendiente y cobrado. |
| 2.3 | Billetera y movimientos externos | Registrar aportes, retiros personales y transferencias. |
| 2.4 | Conciliaciones | Mostrar conciliacion de capital y ganancias, con sus diferencias. |
| 2.5 | Resultado semanal e historico | Reconstruir progreso por semana, periodo e historia. |
| 2.6 | Comision estimada | Mostrar base, tramo, techo y ganancia estimada del trader. |
| 2.7 | Cierre mensual | Se disenara solo luego de que Contabilidad formalice el proceso. |

## Nivel 3: administracion y soporte

Estas funciones son necesarias para operar el SaaS con alumnos, pero no deben
demorar la prueba del primer recorrido economico.

| Orden | Pantalla | Que permite |
|---|---|---|
| 3.1 | Panel administrativo | Ver actividad, alertas y estado general de los participantes autorizados. |
| 3.2 | Usuarios y accesos | Invitar, autorizar, suspender y asignar roles. |
| 3.3 | Periodos | Crear, abrir, bloquear y consultar periodos. |
| 3.4 | Alertas y correcciones | Asignar responsables, revisar diferencias y documentar resoluciones. |
| 3.5 | Auditoria y recuperacion | Consultar cambios y ejecutar recuperaciones confirmadas. |
| 3.6 | Estado del sistema | Consultar backups, integraciones y errores operativos. |

## Nivel 4: automatizaciones e integraciones

Estas pantallas aparecen solo despues de que el ingreso manual equivalente sea
estable y probado.

| Orden | Pantalla | Alcance inicial |
|---|---|---|
| 4.1 | Conexiones | Autorizar o revocar una integracion, sin almacenar contrasenas. |
| 4.2 | Cuenta broker vinculada | Elegir las cuentas autorizadas que corresponden al alumno. |
| 4.3 | Estado de sincronizacion | Ver ultima actualizacion, origen y errores de NinjaTrader u otro proveedor. |
| 4.4 | Importaciones | Revisar datos externos antes de incorporarlos al registro. |

Las integraciones comenzaran en modo de solo lectura. No se enviaran ordenes de
trading desde NODAL App en la primera version.

## Pantallas fuera de la primera aplicacion

- registro publico;
- pagos, suscripciones o facturacion;
- web institucional publica;
- aplicacion movil nativa;
- rutas operativas completas;
- decisiones automaticas realizadas por IA;
- envio de ordenes a brokers.

## Criterio de salida del Nivel 1

El Nivel 1 estara listo para pasar al Nivel 2 cuando un alumno de prueba pueda,
sin datos reales:

1. acceder solo a su espacio autorizado;
2. elegir modalidad y periodo;
3. comprar una cuenta;
4. registrar control diario;
5. guardar una operacion;
6. obtener el estado y resultado bruto esperados;
7. ver el efecto en su resumen;
8. consultar la trazabilidad de lo realizado.

Cada resultado debera coincidir con un caso anonimizado de Sheets antes de
ampliar el alcance.

## Pendientes para el prototipo visual

Antes de dibujar las pantallas del Nivel 1, se debe validar:

- que el orden de uso coincida con el trabajo real de un alumno;
- que el alumno necesite ver todos los indicadores del inicio en la primera
  pantalla o si algunos deben estar dentro del resumen;
- que campos exactos se cargan en cada fase de una operacion;
- que campos son obligatorios en Control Diario;
- que nombre comprensible se usara para cada seccion;
- que acciones pueden corregirse directamente y cuales deben requerir revision.

## Siguiente paso propuesto

Revisar y aprobar esta prioridad. Luego se construira un prototipo visual del
Nivel 1, empezando por el Inicio del alumno, Cuentas y Nueva compra de cuenta.
