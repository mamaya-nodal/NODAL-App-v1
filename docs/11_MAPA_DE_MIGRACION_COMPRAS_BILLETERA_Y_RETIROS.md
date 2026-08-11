# Mapa de migración: compras, billetera y retiros

Estado: borrador de migración.  
Alcance: documentar cómo la aplicación deberá conservar la lógica actual de compras, movimientos de billetera y retiros. No modifica la Plantilla Maestra, Apps Script ni los procesos actuales de Sheets.

## 1. Fuentes de referencia

- `Plantilla Maestra Nodal`, pestañas `Compras General`, `Control Diario`, `Resumen Operativo` e `HISTORIAL_RETIROS`.
- `docs/00_HANDOFF_DESDE_SHEETS.md` y los mapas `08` y `10` de este proyecto.
- Fuentes rectoras de Core, Contabilidad y Operaciones indicadas en `AGENTS.md`.

Ante cualquier diferencia, la planilla y sus reglas vigentes continúan siendo la referencia hasta que el área propietaria confirme un cambio.

## 2. Compras de cuentas

### Hechos vigentes confirmados

La pestaña `Compras General` contiene actualmente estos campos:

| Campo | Regla vigente identificada |
|---|---|
| N° Compra | Consecutivo general generado por el sistema. |
| Fecha Compra | Fecha registrada al crear la compra. |
| Empresa | Empresa elegida de la lista vigente. |
| Referencia | Consecutivo de cuenta propio de cada empresa. |
| Estado Cuenta | Estado derivado de la actividad, no de haber pagado un precio. |
| Precio | Dato manual de la compra. |
| Origen fondos | Solo `Aporte trader` o `Saldo generado`. |
| Resultado bruto | Valor derivado; no es un dato que el alumno deba escribir. |

La lista observable actual de empresas es `FFF`, `LUCID` y `TRADEFY`. Cada una tiene su propia numeración: puede existir, por ejemplo, una cuenta 1 de FFF y una cuenta 1 de LUCID.

Una cuenta sigue siendo **virgen** mientras no tenga datos operativos. El precio de compra, por sí solo, no la convierte en una cuenta viva. Los estados operativos y sus condiciones completas se conservan según el mapa del Registro de Operaciones.

### Comportamiento objetivo de la app (propuesta alineada)

Al confirmar una compra, el alumno solo debería indicar:

1. empresa;
2. precio;
3. origen de fondos.

La aplicación calcularía el número de compra, asignaría la referencia consecutiva de la empresa y registraría la fecha. No se mostrará una opción de origen de fondos inventada ni un campo para escribir una referencia manual.

La compra deberá dejar una traza con usuario, fecha, período, datos originales y correcciones posteriores. Si alguna corrección de fecha o empresa fuera necesaria, no deberá sobrescribir el registro sin historial.

## 3. Billetera: aportes, retiros personales y cobros previos

### Hechos vigentes confirmados

En el Resumen Operativo se registran movimientos externos de billetera con los siguientes tipos exactos:

- `Aporte externo a billetera`;
- `Retiro personal desde billetera`;
- `Cobro pendiente anterior`.

Estos movimientos son flujos de capital o efectivo. No son ganancia de la operatoria y no deben mezclarse con el resultado de broker o de prop firm.

### Comportamiento objetivo de la app (propuesta alineada)

La sección de Billetera conservará, como mínimo, fecha, tipo, importe, observación y trazabilidad del usuario que lo registró. El saldo se mostrará como resultado de los movimientos confirmados; no como un número editable sin origen.

La aplicación deberá impedir que un mismo movimiento se aplique dos veces y registrar cualquier corrección como corrección trazable. Su efecto se reflejará en el Resumen Operativo y en las conciliaciones correspondientes.

## 4. Retiros de cuentas

### Hechos vigentes confirmados

La pestaña `HISTORIAL_RETIROS` conserva actualmente:

| Campo | Significado |
|---|---|
| ID | Identificador del retiro. |
| FECHA_APROBACION | Fecha en que el retiro fue aprobado. |
| EMPRESA | Empresa de la cuenta. |
| CUENTA | Referencia de cuenta dentro de esa empresa. |
| IMPORTE | Importe aprobado. |
| COBRADO | Indica si fue efectivamente cobrado. |
| FECHA_COBRO | Fecha del cobro efectivo. |
| ACTIVO | Estado del registro dentro del historial. |

Un retiro aprobado no equivale todavía a dinero disponible. Primero queda como cobro pendiente; solo al marcarse como cobrado, con fecha de cobro, impacta en la billetera. Esta separación debe mantenerse tanto en los saldos como en la interfaz.

### Comportamiento objetivo de la app (propuesta alineada)

La aplicación diferenciará claramente dos acciones:

1. registrar o importar un retiro aprobado, que genera un pendiente;
2. confirmar su cobro, que registra la fecha real y lo incorpora a billetera.

No habrá en la primera versión una integración automática de cobros con los proveedores. Cualquier automatización futura deberá ser de solo lectura al inicio y pasar por seguridad, permisos y conciliación antes de generar cambios.

## 5. Relación entre estas áreas

| Evento | Afecta | No debe hacer |
|---|---|---|
| Compra de cuenta | Inventario de cuentas, capital invertido y estados derivados | Convertir una cuenta en viva solo por tener precio. |
| Aporte o retiro de billetera | Saldo de billetera y flujos de efectivo | Contabilizarse como ganancia operativa. |
| Retiro aprobado | Pendientes por cobrar | Sumar dinero a billetera antes del cobro. |
| Retiro cobrado | Billetera, historial y conciliación | Borrar la aprobación ni perder su fecha original. |

## 6. Reglas de implementación que deberán preservarse

- Los consecutivos de referencia son independientes por empresa.
- Los nombres de empresa y los orígenes de fondos proceden de la configuración vigente; no se inventan opciones en la interfaz.
- Todo efecto económico debe tener fecha real, período, origen, usuario y trazabilidad de correcciones.
- Un cambio en la aplicación deberá poder conciliarse con las vistas de compras, billetera, pendientes y Resumen Operativo.
- La autorización se aplica en el servidor: un alumno solo puede operar y ver sus propios datos, mientras que las acciones administrativas requieren su rol.

## 7. Información que aún debe validarse

- Procedimiento exacto de Apps Script para altas, correcciones y bajas lógicas de compras y de `HISTORIAL_RETIROS`.
- Política vigente para corregir una compra cargada tarde, incluida su fecha y su período económico.
- Casos de retiro parcial, anulado, reactivado o cobrado en más de un pago.
- Criterio de detección de duplicados para movimientos externos de billetera.
- Flujo de autorización: qué rol registra, aprueba y confirma cada retiro.
- Casos conocidos de conciliación que permitan comparar la app contra la planilla antes de habilitar uso real.

## 8. Pruebas de equivalencia requeridas antes de migrar

1. Crear compras en dos empresas y verificar consecutivos independientes.
2. Comprobar que una compra con precio, sin actividad operativa, sigue virgen.
3. Comparar el efecto de ambos orígenes permitidos de compra con la planilla.
4. Registrar cada tipo válido de movimiento de billetera y conciliar el saldo.
5. Verificar que un retiro aprobado permanece pendiente hasta el cobro.
6. Verificar que el cobro actualiza billetera, conserva ambas fechas y queda auditado.
7. Repetir los casos con correcciones autorizadas y confirmar que no se pierde el historial original.

## 9. Criterio de cierre de este mapa

Este mapa quedará listo para arquitectura cuando se validen los pendientes de la sección 7 y se disponga de casos reales anonimizados para las pruebas de la sección 8. Hasta entonces, describe una dirección de migración, no una implementación autorizada.
