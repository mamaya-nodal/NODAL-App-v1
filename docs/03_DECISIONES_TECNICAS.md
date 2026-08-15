# Decisiones tecnicas de NODAL App

## Confirmadas

| ID | Decision | Estado |
|---|---|---|
| APP-001 | La aplicacion se desarrollara en paralelo al sistema de Sheets. | Vigente |
| APP-002 | Sheets seguira siendo la referencia funcional durante la migracion. | Vigente |
| APP-003 | El codigo se versionara en GitHub desde el comienzo. | Vigente |
| APP-004 | Los cambios deberan ser revisables y probados antes de produccion. | Vigente |
| APP-005 | Cada usuario tendra identidad propia y permisos segun su rol. | Vigente |
| APP-006 | Se desea inicio de sesion con Google. | Vigente |
| APP-007 | Las reglas de negocio no se definiran dentro de componentes visuales. | Vigente |
| APP-008 | No se interrumpira el desarrollo ni la operacion actual para migrar. | Vigente |
| APP-009 | NODAL App sera un SaaS privado, de uso exclusivo para participantes autorizados de NODAL en su primera version. | Vigente |
| APP-010 | El acceso sera por identidad Google y autorizacion previa de NODAL; no habra registro publico libre. | Vigente |
| APP-011 | La web publica y NODAL App seran productos separados bajo la misma identidad; la web enlazara a la aplicacion privada. | Vigente |
| APP-012 | La primera version no incluira cobros en linea, planes publicos ni soporte para multiples organizaciones. | Vigente |
| APP-013 | La app debera requerir del alumno la misma cantidad o menos de carga manual que Sheets para un resultado equivalente; toda carga adicional requerira una justificacion funcional aprobada. | Vigente |
| APP-014 | Tras una vista previa explicita, la confirmacion de un Control Diario de operatoria creara automaticamente los registros correspondientes por cuenta. Se elimina la doble carga manual en Registro de Operaciones, conservando correcciones y auditoria. | Vigente |
| APP-015 | La seleccion de replicas sera explicita, separada de la cuenta lider e independiente por empresa. La interfaz debera admitir hasta 250 cuentas correlativas por empresa sin inferir replicas por consecutividad. | Vigente |
| APP-016 | El Resumen Operativo se conservara completo en una seccion propia. Inicio mostrara solo una sintesis de sus datos y enlaces al detalle; no reemplaza el resumen. | Vigente |
| APP-017 | Control Diario tendra un historial de saldos desde el cual se podra corregir una carga. Al confirmar, el valor corregido reemplazara al anterior en la vista y los calculos, y se recalcularan las entradas de todas las cuentas participantes. Se conservara auditoria interna de la correccion. | Vigente |
| APP-018 | Se permitiran ajustes excepcionales del resultado por cuenta, pero la suma final de lider y replicas debera coincidir exactamente con el resultado total de Control Diario. Una distribucion incongruente no se podra confirmar. | Vigente |
| APP-019 | TypeScript sera el lenguaje principal del frontend y backend. | Vigente |
| APP-020 | La aplicacion privada se construira como monolito modular con Next.js; las reglas de negocio permaneceran separadas de la interfaz. | Vigente |
| APP-021 | Los datos se almacenaran en PostgreSQL administrada con Supabase. Supabase Auth proveera identidad Google y la autorizacion NODAL se aplicara en servidor y con politicas de base. | Vigente |
| APP-022 | Vercel alojara la aplicacion, con ambientes Local, Preview y Produccion separados. | Vigente |
| APP-023 | El codigo y la documentacion de NODAL App residiran en un repositorio privado de GitHub. La futura web publica sera un proyecto separado. | Vigente |
| APP-024 | Antes del piloto real se incorporaran monitoreo de errores, prueba de restauracion de backups y revision humana independiente de seguridad. | Vigente |
| APP-025 | El esquema PostgreSQL se modificara mediante migraciones versionadas y revisables; no mediante cambios manuales sin registrar en el panel remoto. | Vigente |
| APP-026 | El cliente autenticado no tendra escritura directa sobre registros economicos. Las confirmaciones y correcciones pasaran por servicios o funciones transaccionales del servidor con validacion y auditoria. | Vigente |
| APP-027 | Mientras la matriz completa de roles siga abierta, las altas y revocaciones de acceso se ejecutaran mediante funciones auditadas restringidas a la credencial privilegiada del servidor o al propietario de la base. No existira autorizacion desde el navegador del alumno. | Vigente |
| APP-028 | Los espacios `Real` y `Practica` permanecen separados y se seleccionan de forma explicita. El selector mensual solo permite elegir periodos ya existentes: no crea ni abre meses automaticamente. La politica de apertura y cierre mensual sigue pendiente del area propietaria. | Vigente |
| APP-029 | La compra se confirma mediante una unica transaccion validada: el alumno carga empresa, precio y uno de los dos origenes vigentes; el servidor genera fecha, numero general, referencia por empresa, cuenta virgen y auditoria. Hasta definir la politica de cargas tardias, la fecha automatica solo se registra en el mes calendario seleccionado. | Vigente |
| APP-030 | La distribucion automatica de Control Diario solo se habilita cuando el resultado puede repartirse en centavos exactos entre las cuentas participantes. Si no cierra exactamente, la app bloquea la confirmacion hasta aplicar un ajuste excepcional validado; nunca asigna el sobrante de forma silenciosa. | Vigente |
| APP-031 | Empresa, lider, replicas y fase se preparan antes de recibir el siguiente saldo. Un saldo recibido desde NinjaTrader exige revision: confirmar, cambiar el destino o informar un error de sincronizacion. No existe `dejar pendiente` ni carga manual como alternativa normal. La contingencia conserva el dato original, exige motivo y saldo corregido, recalcula en NODAL y deja auditoria. | Vigente |
| APP-032 | Hasta implementar el flujo de correccion y recalculo historico, Control Diario solo admite nuevas cargas en orden cronologico dentro del periodo. Una fecha anterior al ultimo control confirmado se bloquea en vez de alterar silenciosamente saldos y registros posteriores. | Vigente |
| APP-033 | El estado de una cuenta no se actualizara desde un resultado broker aislado. La regla se aplicara cuando la app pueda calcular el `TOTAL GANANCIA` completo de cada fase; hasta entonces el servicio determinista queda probado pero desconectado de la escritura remota. | Vigente |
| APP-034 | La interfaz de desarrollo de Control Diario guarda movimientos confirmados mediante la transaccion segura del servidor y crea automaticamente los registros por cuenta. Mientras NinjaTrader no este conectado, cada saldo simulado queda identificado por una clave de evento y una observacion de desarrollo. Este guardado no actualiza el estado de las cuentas. | Vigente |
| APP-035 | Registro de Operaciones comienza como una vista de solo lectura por empresa y cuenta. Muestra fase, fecha, rol, origen en Control Diario y magnitudes `NETO BROKER +` o `NETO BROKER -`. Su resumen se denomina resultado broker visible y no se presenta como `TOTAL GANANCIA` ni actualiza el estado mientras falten componentes de la regla completa. | Vigente |
| APP-036 | El primer Resumen de progreso se calcula exclusivamente desde Compras, Control Diario, cuentas y Registro de Operaciones. Mantiene separados saldo, movimientos y resultado operativo; una ausencia de saldo se muestra como dato faltante y no como cero. `TOTAL GANANCIA`, billetera, retiros de fondeo, comisiones y conciliaciones permanecen fuera hasta validar sus reglas completas. | Vigente |
| APP-037 | El detalle consultable de cuenta se integra en Registro y reutiliza la selección por empresa y referencia. Expone compra, precio, origen, estado guardado, actividad, roles y las seis fases. Los valores de fase se denominan subtotales broker visibles y no `TOTAL GANANCIA`; las fases sin actividad permanecen visibles sin inventar importes. | Vigente |
| APP-038 | Inicio presenta una síntesis calculada del período y una única orientación contextual: registrar una cuenta, establecer el depósito inicial o preparar la próxima operación. No reemplaza Resumen ni solicita datos adicionales; sus enlaces conducen al módulo de origen. | Vigente |
| APP-039 | La corrección histórica inicial se limita a saldos confirmados de Control Diario. Reemplaza el saldo visible, recalcula cronológicamente saldos y resultados posteriores, reescribe participantes y registros derivados, y conserva instantáneas internas del antes y después con motivo. Si un retiro queda sin fondos o una distribución no cierra en centavos exactos, toda la corrección se revierte. | Vigente |
| APP-040 | El ajuste excepcional por cuenta parte de la distribución automática, exige un motivo y solo se confirma cuando los importes firmados de líder y réplicas suman exactamente el resultado total. La distribución exacta y su motivo quedan auditados. Una corrección histórica que alcance un reparto excepcional se bloquea antes de sobrescribirlo hasta contar con una redistribución explícita aprobada. | Vigente |
| APP-041 | La corrección histórica que afecta repartos excepcionales se realiza en dos pasos: primero calcula todos los resultados posteriores y luego exige revisar cada redistribución afectada. La diferencia se propone inicialmente en la cuenta líder, puede editarse por cuenta y solo se confirma si cada suma coincide exactamente. Saldo, registros derivados y auditoría se actualizan en una única transacción. | Vigente |
| APP-042 | El Historial de actividad del alumno se obtiene mediante una lectura segura y acotada por período propio. Muestra compras, confirmaciones y correcciones con su fecha y motivo, pero no concede acceso a las instantáneas internas de auditoría. Una corrección se distingue visualmente y no aparece como una segunda operación vigente. | Vigente |
| APP-043 | La primera publicación externa se realiza en un proyecto Vercel separado llamado `nodal-app-preview`, conectado exclusivamente a la base Supabase de desarrollo. Sirve para pruebas privadas y demostraciones; no es producción, no contiene datos reales y no reemplaza Sheets. | Vigente |
| APP-044 | `TOTAL GANANCIA` se calcula por cuenta y fase desde sus componentes guardados: en Evaluación es `NETO BROKER + − NETO BROKER -`; en las vueltas se suma además el `TOTAL RETIRO` informado manualmente. La carga de retiro no se infiere desde una fórmula porque el pago real de cada empresa de fondeo puede diferir. | Vigente |
| APP-045 | El estado admite Automático, Forzar Cuenta viva y Forzar Cuenta cerrada. El modo forzado queda guardado y auditado. Forzar viva conserva el arrastre positivo a la siguiente vuelta; al volver a Automático se recupera el estado calculado. | Vigente |

## Propuestas pendientes de decision

| ID | Propuesta | Estado |
|---|---|---|
| APP-P06 | Estrategia de importacion del historico de Sheets. | Abierta |
| APP-P08 | Politica de retencion, exportacion y recuperacion. | Abierta |

## Registro de nuevas decisiones

Cada decision debe indicar fecha, responsable, motivo, alternativas evaluadas,
impacto, estado y decision reemplazada. Una recomendacion tecnica no pasa a
vigente sin aprobacion y evidencia suficiente.
