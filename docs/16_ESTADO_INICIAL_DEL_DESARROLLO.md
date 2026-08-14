# Estado inicial del desarrollo

- Fecha de ultima verificacion: `2026-08-12`
- Estado: base local, autenticacion Google y contexto operativo verificadas
- Datos reales: ninguno; solo contexto de desarrollo del responsable NODAL
- Servicios externos conectados: GitHub privado, Supabase de desarrollo y
  Google OAuth de desarrollo

## Resultado de esta etapa

NODAL App ya posee un esqueleto tecnico ejecutable. Todavia no es una version
funcional para alumnos: es la base sobre la cual se construiran los modulos sin
mezclar reglas de negocio, interfaz y conexiones externas.

## Herramientas instaladas

| Herramienta | Version inicial bloqueada en `package-lock.json` | Uso |
|---|---:|---|
| Next.js | 16.3.0 | Aplicacion web y servidor. |
| React | 19.2.8 | Interfaz. |
| TypeScript | 6.0.3 | Lenguaje y verificacion de tipos. |
| ESLint | 9.39.5 | Control de calidad del codigo. |
| Vitest | 4.1.10 | Pruebas automaticas. |

TypeScript 7 y ESLint 10 no se utilizaron porque las herramientas actuales de
Next.js presentaron incompatibilidades. Se fijaron versiones compatibles y
reproducibles, sin vulnerabilidades reportadas por la instalacion.

## Estructura creada

```text
src/
  app/                         Pantallas, rutas de autenticacion y estilos
  lib/supabase/                Clientes separados para navegador y servidor
  modules/
    access/domain/             Decision identidad/autorizacion
    control-diario/
      domain/                  Reglas sin interfaz ni base de datos
    purchases/domain/          Reglas confirmadas de compras
    workspace/domain/          Seleccion segura de modalidad y periodo
supabase/migrations/           Esquema PostgreSQL versionado
docs/                          Conocimiento y decisiones del proyecto
```

El primer archivo de negocio valida reglas ya confirmadas:

1. la suma distribuida entre lider y replicas debe coincidir con el resultado
   total de Control Diario;
2. una perdida economica se convierte en magnitud positiva para
   `NETO BROKER -`;
3. una ganancia se dirige a `NETO BROKER +`.

Los importes de estas reglas se representan internamente en centavos enteros
para evitar errores de redondeo del lenguaje.

## Verificaciones realizadas

| Verificacion | Resultado |
|---|---|
| Pruebas automatizadas | 88 de 88 aprobadas. |
| TypeScript estricto | Aprobado. |
| ESLint | Aprobado. |
| Compilacion de produccion | Aprobada con Next.js 16.3.0. |
| Auditoria de dependencias durante instalacion | 0 vulnerabilidades reportadas. |
| Inicio de sesion Google | Aprobado con el usuario de prueba NODAL. |
| Separacion identidad/autorizacion | Aprobada: identidad valida sin registro activo queda bloqueada. |
| Cierre de sesion | Aprobado. |
| Acceso directo a `/app` sin sesion | Bloqueado y redirigido al inicio. |
| Primer usuario de desarrollo | Autorizado y verificado de extremo a extremo. |
| Alta desde `anon` o `authenticated` | Bloqueada por permisos de PostgreSQL. |
| Alta desde `service_role` | Permitida exclusivamente en servidor privilegiado. |
| Auditoria de autorizaciones | RLS activo y acceso directo del alumno revocado. |
| Espacios del primer usuario | `Real` y `Practica` creados y aislados. |
| Periodo de desarrollo | Agosto de 2026 disponible en ambas modalidades. |
| Selector de contexto | Cambio Real/Practica y periodo mensual aprobado de extremo a extremo. |
| Parametros manipulados | Un mes inexistente se reemplaza por un contexto existente y permitido. |
| Formulario inicial de compra | Muestra solo empresa, precio y origen de fondos. |
| Catalogos de compra | Solo `FFF`, `LUCID`, `TRADEFY`, `Aporte trader` y `Saldo generado`. |
| Alta transaccional | Fecha, numero, referencia, cuenta virgen y auditoria se generan juntos. |
| Seguridad de compras | Sin escritura directa del navegador; funcion validada solo para usuario autorizado y periodo propio. |
| Nucleo de Control Diario | Depositos, retiros y actualizaciones de saldo calculados con centavos enteros y sin mezclar capital con resultado. |
| Vista previa de Control Diario | Simulacion interactiva aprobada: deposito USD 5.000 y saldo USD 5.500 producen resultado +USD 500. |
| Seleccion operativa | Empresa, cuenta lider, fase y replicas explicitas preparadas exclusivamente con cuentas existentes del periodo. |
| Aislamiento de cuentas | Cada empresa carga su propia grilla; la lider no puede figurar tambien como replica. |
| Distribucion previa | Muestra una fila por lider y replica, su destino `NETO BROKER +` o `NETO BROKER -` y comprueba el total exacto. |
| Centavos no divisibles | La confirmacion queda bloqueada; no se asigna un sobrante silenciosamente. |
| Preparacion previa | Empresa, lider, replicas y fase aparecen antes del saldo y permanecen visibles como configuracion activa. |
| Recepcion NinjaTrader simulada | Un nuevo saldo abre una revision obligatoria con destino y distribucion; un segundo saldo queda bloqueado hasta resolver el primero. |
| Contingencia simulada | Permite clasificar el error, indicar el saldo correcto, recalcular y mostrar que el original se reservara para auditoria. |
| Persistencia de Control Diario | Interfaz conectada con la transaccion segura: deposito, retiro y saldo confirmado reaparecen al recargar. |
| Registros derivados | La transaccion crea participantes y una entrada por cuenta, con rol, fase, destino e importe. |
| Idempotencia | Una confirmacion repetida o un evento repetido de NinjaTrader devuelve el control existente sin duplicar filas. |
| Seguridad economica | El alumno no puede escribir directamente en Control Diario, participantes ni registros por cuenta. |
| Prueba remota reversible | Deposito USD 5.000, saldo USD 5.600 y tres entradas de USD 200 aprobados dentro de una transaccion luego revertida. |
| Limpieza posterior | Cero periodos, controles o cuentas funcionales de prueba permanecieron en Supabase. |
| Regla de estados | Servicio determinista probado para virgen, viva y cerrada; escritura remota desconectada hasta completar `TOTAL GANANCIA`. |
| Totales de fase | Calculo de broker positivo, broker negativo, retiro y arrastre negativo verificado contra formulas de la plantilla. |
| Lectura de referencia | `PLANTILLA_LIMPIA!A1:F70` inspeccionada sin modificar la Plantilla Maestra. |
| Presentacion provisional | Cabecera compacta, navegacion de modulos, identidad privada y recorrido completo revisados para demostracion. |
| Confirmacion desde interfaz | Deposito USD 5.000 y saldo USD 5.600 generaron resultado USD 600, tres participantes y tres registros por cuenta de USD 200. |
| Persistencia visual | Tras recargar, el saldo y el historial confirmados reaparecieron desde Supabase. |
| Estado preservado | Las cuentas participantes continuaron virgenes; Control Diario no cambia estados con resultados parciales. |
| Limpieza de prueba | Los controles técnicos, sus registros derivados, las seis compras de demostración, sus cuentas y auditorías se retiraron después de verificarlos. La base funcional quedó vacía. |
| Registro de Operaciones | Vista de solo lectura por empresa y cuenta conectada a las entradas derivadas de Control Diario. |
| Fases visibles | Cada entrada muestra fase, fecha, rol lider/replica, destino broker, importe y origen en Control Diario. |
| Resumen acotado | Suma `NETO BROKER +`, `NETO BROKER -` y resultado broker visible sin presentarlo como `TOTAL GANANCIA`. |
| Actualizacion del Registro | Dos saldos consecutivos actualizaron automaticamente la cuenta lider y sus replicas; la prueba reversible fue retirada luego de comprobarla. |
| Resumen inicial | Sección calculada y enlazada desde la navegación con saldo broker, resultado operativo registrado, cuentas, compras, actividad y movimientos separados. La ausencia de saldo no se representa como cero. |
| Detalle de cuenta | La selección del Registro muestra ficha de compra, estado guardado, precio, origen, participación como líder o réplica y las seis fases con sus subtotales broker visibles. |
| Verificación visual de cuenta | Se creó una compra técnica temporal de LUCID por USD 89, se revisó la ficha completa y luego se retiraron compra, cuenta y auditoría. La base volvió a cero compras y cero cuentas. |
| Inicio del alumno | Síntesis automática de saldo, resultado operativo, cuentas y operatorias, con siguiente paso contextual y enlace directo al módulo correspondiente. |
| Corrección histórica de saldo | Desde el historial se corrige un nuevo saldo con motivo obligatorio; la transacción recalcula la cadena posterior, participantes y registros por cuenta, y conserva auditoría interna del antes y después. |
| Integridad de correcciones | Una distribución indivisible en centavos o un retiro que supere el saldo recalculado revierte la operación completa sin cambios parciales. |
| Verificación remota de corrección | USD 5.600 se corrigió a USD 5.500; resultado y Registro pasaron de USD 600 a USD 500. La prueba reversible y la prueba visual fueron retiradas; la base volvió a cero compras, cuentas, controles y entradas. |
| Historial de actividad | Nueva sección por período con compras, confirmaciones y correcciones ordenadas cronológicamente; las correcciones muestran motivo sin duplicar la operación vigente. |
| Seguridad del historial | La función remota entrega solo campos preparados para el alumno y valida acceso al período. `audit_events` continúa sin permiso de lectura directa para usuarios autenticados. |
| Verificación visual de actividad | Navegación, estado vacío, texto explicativo y distribución visual revisados en la aplicación local con la base de desarrollo vacía. |
| Primer caso integral de equivalencia | Ocho compras LUCID, depósito USD 5.000, saldo USD 5.500, líder 1 y réplicas 4, 7 y 8 produjeron cuatro entradas de USD 125, Resumen coherente y diez eventos de Actividad. Las cuentas intermedias no participaron y los estados permanecieron vírgenes. |
| Limpieza del caso integral | La prueba PostgreSQL completa finalizó con `ROLLBACK`; una consulta posterior confirmó cero compras, cuentas, controles y entradas. |

En este equipo Windows, el servidor local debe iniciarse con el certificado de
confianza `supabase/.temp/windows-ca.pem` mediante `NODE_EXTRA_CA_CERTS`. El
archivo es local, esta ignorado por Git y no se desactiva la validacion TLS.

## Lo que deliberadamente no se hizo

- no se publico en Vercel;
- no se copiaron datos de alumnos ni de la Plantilla Maestra;
- no se modifico Sheets, Apps Script ni Panel Central;
- no se creo ninguna compra ficticia para completar una prueba visual.
- no se inventaron colores para las empresas: su correspondencia exacta sigue pendiente de validacion.
- no se concedio acceso NODAL automaticamente al usuario autenticado.
- no se definio ni automatizo la apertura o el cierre mensual.
- no se conecto todavia la API de NinjaTrader; la recepcion actual es una simulacion visual.
- no se actualizan todavia estados de cuenta desde los registros derivados.
- no se copio la formula operativa de `TOTAL RETIRO`, pendiente de aprobacion y casos de equivalencia.

## Siguiente etapa tecnica

La transacción, su conexión con Control Diario, el Registro de Operaciones de
solo lectura, el detalle consultable de cuenta, el primer Resumen de progreso y
el Historial de actividad ya fueron comprobados. El primer recorrido integral
con reglas confirmadas también quedó automatizado. La comparación definitiva
contra un caso real anonimizado de Sheets sigue pendiente de aprobación
funcional. El siguiente avance debe abordar una regla pendiente solamente
cuando sus fuentes permitan equivalencia.
La actualización de estados y el cálculo completo de `TOTAL GANANCIA` siguen
separados hasta validar sus reglas y casos de equivalencia. Todavía no se
habilitan datos reales ni acceso general de alumnos.

Antes de crear cuentas externas se indicara al responsable de NODAL que debe
hacer, que acceso conservar y que costo puede generar.
