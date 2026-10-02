# Mapa funcional de NODAL App

- Version: `0.1`
- Fecha: `2026-08-03`
- Propietario: `Producto y Tecnologia`
- Estado: `Propuesta inicial para validacion funcional`
- Fuentes rectoras: NODAL Core, Contabilidad y Gestion, Operaciones y el sistema vigente de Google Sheets

## Proposito

Este documento describe, en lenguaje funcional, que debera permitir hacer NODAL App y que informacion debera conservar. Todavia no define tecnologias, proveedores, arquitectura ni diseno visual definitivo.

La aplicacion no se considera equivalente por parecerse visualmente a la planilla. Debe permitir reconstruir la operatoria del alumno, explicar la evolucion de su capital y producir los mismos resultados esperados que Sheets cuando recibe los mismos datos.

## Clasificacion de las afirmaciones

- **Vigente:** regla o comportamiento confirmado por las fuentes actuales.
- **Decision de producto:** alcance ya confirmado para NODAL App.
- **Propuesta:** forma sugerida de presentar o simplificar una funcion.
- **Pendiente:** informacion o decision que debe validar el area propietaria.

Una propuesta no modifica por si misma una regla de Core, Contabilidad u Operaciones.

## Principio de carga agil

**Decision de producto confirmada:** la aplicacion debe hacer el trabajo del
alumno mas rapido y simple que la planilla, o como minimo igual de simple para
un resultado equivalente. No se trasladara la complejidad interna del sistema a
formularios de carga.

Por lo tanto, toda pantalla debe:

- solicitar solo informacion que el sistema no puede conocer de una fuente
  fiable;
- no pedir dos veces un dato ya registrado;
- calcular, completar o recordar datos cuando sea seguro hacerlo;
- mostrar campos adicionales solo cuando correspondan a la accion actual;
- explicar de forma clara los datos manuales que sigan siendo necesarios;
- conservar la trazabilidad sin obligar al alumno a realizar tareas
  administrativas;
- justificar y aprobar cualquier carga manual nueva respecto de Sheets.

Automatizar no significa ocultar la informacion: el alumno debera poder ver de
donde proviene cada resultado y corregirlo mediante un proceso trazable cuando
corresponda.

## Resultado que debe ofrecer el producto

Al finalizar un periodo, el alumno debe poder responder con evidencia:

1. que cuentas compro y con que fondos;
2. que cuentas permanecen virgenes, vivas o cerradas;
3. que operaciones realizo, cuando y en que fase;
4. que cuentas fueron lideres y cuales fueron replicas registradas;
5. como evoluciono el saldo de su broker;
6. que importes estan en broker, billetera, cuentas o retiros pendientes;
7. cuanto capital aporto o retiro;
8. cual fue su resultado semanal, mensual e historico;
9. que comision estimada corresponde y cual es su ganancia estimada;
10. si existen diferencias, datos incompletos o correcciones pendientes.

## Usuarios y responsabilidades

### Alumno o trader

**Vigente:** utiliza una identidad propia y solo debe acceder a sus datos y periodos.

Necesita trabajar separadamente en Real y Practica; registrar compras, movimientos y operaciones; relacionar lideres, replicas y fases; consultar resultados y progreso; corregir informacion incompleta; y conocer el origen de los datos automaticos.

### Administrador

**Vigente:** gestiona usuarios, roles, periodos, alertas y seguimiento. Los administradores no computan comision de mesa.

Necesita gestionar accesos, consultar la informacion autorizada, revisar alertas y conciliaciones, ejecutar procesos mensuales aprobados, recuperar informacion sin borrar el historial y conocer quien hizo cada cambio.

### Areas propietarias

**Decision de producto:** la aplicacion permitira supervision sin cambiar la propiedad funcional de las reglas.

- Direccion y Core resuelven decisiones institucionales y conflictos.
- Contabilidad y Gestion valida registros, conciliaciones, comisiones y cierres.
- Operaciones valida fases, rutas, replicas, ejecucion y riesgo.
- Producto y Tecnologia implementa, prueba y protege el sistema.

## Recorrido principal del alumno

### 1. Acceso

**Decision confirmada:** cada persona inicia sesion con su propia identidad y se desea utilizar Google para la autenticacion.

La aplicacion debe identificar al usuario, comprobar sus permisos en el servidor, mostrar solamente sus espacios, registrar acciones sensibles y permitir cerrar la sesion.

**Propuesta:** el primer ingreso incluira una guia breve sobre Real, Practica, periodos y datos pendientes.

### 2. Modalidad y periodo

**Vigente:** Real y Practica son espacios separados. La actividad se organiza por periodos mensuales.

La aplicacion debe indicar la modalidad, impedir cruces entre Real y Practica, mostrar el periodo activo, permitir consultar historicos, restringir cambios posteriores al cierre y conservar el periodo original de cada registro.

**Pendiente de Contabilidad:** formalizar apertura, cierre, traslado historico y correcciones posteriores.

### 3. Inicio o panel del alumno

**Propuesta:** el alumno debe ver una explicacion de su situacion, no una copia de las celdas de Sheets.

El panel deberia mostrar:

- saldo broker y momento de su ultima actualizacion;
- saldo de billetera;
- retiros de fondeo pendientes;
- precio de cuentas virgenes;
- flotante asociado a cuentas vivas;
- cantidad de cuentas virgenes, vivas y cerradas;
- resultado semanal, del periodo e historico;
- ganancia realizada de cuentas cerradas;
- comision estimada y ganancia estimada del trader;
- estado de las conciliaciones;
- alertas y acciones que requieren atencion.

Todo valor automatico debe mostrar su fecha, origen y una explicacion comprensible.

### 4. Compra de cuentas

**Vigente:** una compra registra fecha, empresa, referencia, precio y origen de fondos. Una cuenta nueva comienza con estado contable Cuenta virgen, estado operativo Evaluation y fase Evaluación Día 1.

La aplicacion debe registrar la fecha real, identificar empresa y referencia, conservar precio y origen, evitar duplicados, mostrar estado y resultado bruto y conservar las correcciones.

**Vigente:** el precio por si solo no convierte una cuenta en viva.

**Pendiente:** confirmar en produccion que el precio vigente es manual y definir sus validaciones.

### 5. Control diario del broker

**Vigente:** conserva fecha operativa, deposito o retiro, saldo, resultado, empresa, cuenta lider, fase, observaciones y origen o destino.

La aplicacion debe:

- registrar la fecha real de actividad;
- distinguir un movimiento de fondos de un resultado;
- calcular el resultado contra el saldo anterior cuando corresponda;
- relacionar el registro con empresa, lider y fase;
- aceptar observaciones y clasificaciones necesarias;
- evitar que la fecha de carga reemplace la fecha operativa;
- advertir inconsistencias y datos faltantes.

**Propuesta:** el saldo podra sincronizarse desde NinjaTrader. Debe conservarse una carga manual de respaldo y mostrarse cuando el dato automatico este desactualizado.

**Pendiente:** determinar que valor de NinjaTrader equivale al Saldo Actual de Sheets para cada proveedor utilizado.

### 6. Operaciones por cuenta

**Vigente:** una cuenta puede contener Evaluación y vueltas Primera a Quinta. El resultado depende del recorrido completo. Las vueltas posteriores que se incorporen deben conservar la misma regla.

Los tres ejes se registran por separado:

- fase NODAL: Evaluación, Primera vuelta, Segunda vuelta y siguientes;
- estado operativo: Evaluation, Funded o Live;
- estado contable: Virgen, Viva o Cerrada.

El día es el ordinal del trade dentro de la fase. Una cuenta nueva muestra
`Evaluación Día 1`; al cerrarse ese trade muestra `Evaluación Día 2`, aunque
ambos trades ocurran en la misma fecha. Cuatro filas de Evaluación y seis por
vuelta son una presentación inicial y no limitan la cantidad de trades.

Al superar Evaluación se enlaza la nueva cuenta, comienza Primera vuelta Día 1
y el estado operativo pasa a Funded. El primer payout aprobado por la prop abre
Segunda vuelta Día 1; cada payout aprobado siguiente abre la vuelta posterior.
El estado permanece Funded hasta una transición independiente a Live.

La aplicacion debe seleccionar empresa y cuenta, mostrar ambos estados, fase y día de trade, registrar las fases sin perder historia, guardar y corregir datos, calcular totales deterministas y conservar origen, fecha y usuario.

**Vigente:** un total negativo se arrastra a la etapa siguiente; uno positivo no se arrastra.

**Pendiente de Operaciones:** documentar únicamente las condiciones operativas
detalladas que aún falten dentro de cada fase. La secuencia, los días por trade
y el avance por payout ya están confirmados. Las rutas completas no se copiarán
sin necesidad y aprobación.

### 7. Estados contables

Automatizacion del estado contable vigente:

1. algun `TOTAL GANANCIA` positivo: Cuenta cerrada;
2. datos operativos sin total positivo: Cuenta viva;
3. ausencia de datos operativos: Cuenta virgen.

La aplicacion debe calcular el estado contable en el servidor, explicar su causa, actualizar los resumenes y conservar los datos que lo determinaron.

**Pendiente de Operaciones:** validar que esta automatizacion representa todos los escenarios reales.

**Pendiente conjunto:** definir permisos, motivo y consecuencias del cierre manual excepcional de una cuenta viva con resultado negativo.

### 8. Lideres y replicas

**Vigente:** una replica existe solo cuando fue registrada expresamente. No se infiere por referencias consecutivas.

La aplicacion debe seleccionar lider y replicas, registrar el grupo, copiar la informacion indicada, mantener el mismo estado resultante, evitar duplicaciones y conservar trazabilidad.

**Pendiente de Operaciones:** definir si una replica puede separarse del grupo y como se trata su historia.

### 9. Retiros de fondeo

**Vigente:** un retiro aprobado todavia no es efectivo en billetera. Cuando se acredita, deja de estar pendiente y pasa a billetera.

La aplicacion debe distinguir importe y fecha de aprobacion, estado pendiente, importe y fecha de cobro, destino y correcciones.

**Propuesta:** integrar empresas prop cuando exista una API autorizada. Sin API, se mantendra una carga manual o importacion controlada.

### 10. Billetera y movimientos externos

**Vigente:** los movimientos entre ubicaciones no son automaticamente ganancias o perdidas.

La aplicacion debe registrar aportes, retiros personales y transferencias con origen, destino, fecha, importe y moneda; evitar duplicados y separarlos del resultado operativo.

Estos datos continuaran siendo manuales cuando no exista una fuente fiable.

### 11. Resultados y progreso del capital

La aplicacion debe presentar separadamente:

- **Capital:** recursos propios incorporados al sistema.
- **Flujo de caja:** movimientos entre ubicaciones.
- **Resultado:** ganancia o perdida de la operatoria.

Debe ofrecer vistas diarias, semanales, mensuales e historicas. Cada indicador debera poder explicarse y vincularse con los registros que lo componen.

### 12. Conciliaciones

**Vigente:** una diferencia distinta de cero requiere revision; no debe ocultarse ni corregirse automaticamente sin evidencia.

La aplicacion debe calcular conciliacion de capital y de ganancias, mostrar los registros incluidos, la diferencia, el estado de revision y su resolucion.

Una diferencia entre NODAL App y Sheets se registra como hallazgo de conciliacion. No autoriza a cambiar una regla.

### 13. Comision y ganancia estimada

**Vigente:** la base actual es la ganancia realizada de cuentas cerradas. Si el resultado es menor o igual a cero, la comision es cero.

- menos de USD 10.000: 50%, con techo de USD 4.400;
- desde USD 10.000 y menos de USD 15.000: 40%, con techo de USD 5.500;
- desde USD 15.000 y menos de USD 35.000: 35%;
- desde USD 35.000: 25%.

Ganancia estimada del trader:

`MAX(ganancia realizada, 0) - comision estimada de mesa`.

La aplicacion debe mostrar base, tramo, porcentaje, techo y resultado; marcarlo como estimado durante el mes; excluir administradores y conservar la version de la regla utilizada.

**Pendiente:** validar las condiciones comerciales y contractuales antes de transformar la estimacion en una obligacion definitiva.

### 14. Alertas y correcciones

La aplicacion debe alertar sobre datos faltantes, duplicados, fechas incoherentes, saldo desactualizado, diferencias de conciliacion, replicas incompletas, cambios posteriores al cierre y fallas de integracion.

Cada alerta tendra estado, responsable, fecha, comentario y resolucion. Cambiar manualmente su estado debera actualizar los contadores relacionados.

### 15. Cierre y apertura mensual

**Decision de producto:** la aplicacion debera cerrar y reconstruir un mes completo, pero no inventara el procedimiento aun no formalizado.

El futuro proceso debera contemplar revision de pendientes, conciliaciones, calculo final, traslado historico, cuentas vivas, bloqueo, autorizacion, correcciones auditadas y apertura del nuevo periodo.

**Pendiente de Contabilidad:** definir la regla completa y los criterios de reapertura.

## Recorrido principal del administrador

El espacio administrativo debera permitir:

1. gestionar usuarios, roles, pertenencias y accesos;
2. administrar periodos Real y Practica;
3. consultar actividad y ultima actualizacion de cada alumno;
4. revisar cuentas, resultados, comisiones y conciliaciones;
5. administrar alertas y correcciones;
6. iniciar cierres cuando exista una regla aprobada;
7. consultar auditoria sin alterar registros;
8. ejecutar recuperaciones confirmadas y registradas;
9. exportar informacion y conservar historicos;
10. conocer el estado de integraciones, backups y automatizaciones.

Los permisos concretos deben definirse antes de implementar el panel. Autenticacion y autorizacion son responsabilidades distintas.

## Origen de la informacion

| Informacion | Origen inicial | Automatizacion posible | Estado |
|---|---|---|---|
| Identidad | Google | Google | Confirmada |
| Compra prop | Manual | API o importacion | Integrable |
| Precio de compra | Manual | API futura | Pendiente de verificacion |
| Lider y replicas | Seleccion explicita | Propagacion automatica | Vigente |
| Fase | Seleccion explicita | Asistencia futura | Vigente |
| Saldo broker | Manual | NinjaTrader | Integrable |
| Movimientos broker | Manual | Broker | Integrable |
| Ejecuciones broker | Registro actual | API o conector local | Integrable |
| Aportes y retiros personales | Manual | No asumir | Vigente |
| Retiro prop aprobado | Manual | API de empresa prop | Integrable |
| Retiro cobrado | Manual | Fuente autorizada | Integrable |
| Estado de cuenta | Calculo | Automatico | Vigente, a validar |
| Resultado bruto | Calculo | Automatico | Vigente |
| Resumen y conciliaciones | Calculo | Automatico | Vigente |
| Comision estimada | Calculo | Automatico | Vigente |
| Cierre mensual | Administrativo | Flujo asistido | Pendiente |

## Reglas para cualquier automatizacion

Una integracion futura debe:

- comenzar con permisos de solo lectura;
- no pedir ni guardar contrasenas del proveedor;
- permitir autorizar y revocar la conexion;
- identificar las cuentas seleccionadas;
- registrar proveedor, cuenta y fechas del dato y recepcion;
- evitar duplicados;
- mostrar si la informacion esta desactualizada;
- conservar una alternativa manual controlada;
- registrar correcciones sin borrar el valor original;
- fallar sin impedir el uso del resto de la aplicacion;
- probarse primero con datos de demostracion o anonimizados.

La primera version no enviara ordenes ni ejecutara operaciones de trading.

## Primer recorrido a construir

El primer incremento sera pequeno pero completo:

1. un usuario de prueba ingresa sin datos productivos;
2. selecciona Real o Practica y un periodo;
3. registra la compra de una cuenta;
4. registra un control diario;
5. guarda una operacion de una fase;
6. el sistema actualiza fase, día, estados y resultado bruto;
7. el panel refleja el efecto sobre el capital;
8. la auditoria permite reconstruir las acciones.

No incluye inicialmente integracion productiva con NinjaTrader, cierre mensual definitivo, migracion masiva, panel administrativo completo, rutas no documentadas, envio de ordenes ni decisiones realizadas por IA.

## Pruebas de equivalencia iniciales

Con casos anonimizados de Sheets se comprobara:

- numeracion y referencia de compra;
- estado contable inicial Cuenta virgen y estado operativo Evaluation;
- efecto del precio sin actividad;
- calculo de movimientos y saldo;
- preservacion de fecha operativa;
- guardado y recuperacion de una fase;
- transición de fase, estado operativo y estado contable;
- resultado bruto;
- actualizacion del resumen;
- aislamiento entre usuarios, modalidades y periodos;
- trazabilidad de creacion y correccion.

Una diferencia se clasificara como dato de entrada, regla, implementacion o problema de fuente antes de decidir cualquier cambio.

## Informacion pendiente de validacion

### Contabilidad y Gestion

- precio de compra productivo definitivo;
- definicion exacta del Saldo Actual;
- cierre, apertura y correcciones posteriores;
- campos de retiros y movimientos externos;
- casos anonimizados con resultados esperados.

### Operaciones

- condiciones operativas detalladas todavía no documentadas dentro de cada fase;
- suficiencia de la regla de estados;
- cierres negativos excepcionales;
- cambios permitidos en grupos de replicas;
- informacion visible sin exponer rutas confidenciales.

### Direccion y Legal

- datos financieros visibles para administradores;
- condiciones comerciales definitivas;
- privacidad, consentimiento, retencion y exportacion;
- autorizaciones para integraciones externas.

### Producto y Tecnologia

- proveedores y conexiones usados por los alumnos;
- importacion del historico de Sheets;
- permisos por rol;
- disponibilidad, backups y recuperacion;
- volumen estimado de usuarios, cuentas y operaciones.

## Criterios para aprobar el mapa

El mapa estara listo para orientar el diseno cuando:

1. represente el uso real del alumno;
2. no falte informacion para reconstruir capital y operatoria;
3. cada calculo tenga propietario y fuente;
4. se distingan tareas manuales y automaticas;
5. cada pendiente tenga responsable;
6. existan casos conocidos para probar el primer recorrido;
7. Contabilidad y Operaciones identifiquen contradicciones u omisiones;
8. Direccion resuelva los conflictos entre areas.

## Siguiente paso propuesto

Revisar este mapa y convertirlo en:

1. una lista priorizada de pantallas;
2. un prototipo visual sin datos reales;
3. una matriz de equivalencia entre pantallas y Sheets;
4. casos de prueba anonimizados;
5. decisiones tecnicas posteriores basadas en el alcance validado.
