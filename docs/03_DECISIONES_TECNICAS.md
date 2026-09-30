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
| APP-015 | La seleccion manual de replicas queda como contingencia para controles históricos. La operación automática correlaciona telemetría real sin pedir líder ni grupo al usuario. | Reemplazada para automatización por APP-085 |
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
| APP-030 | El reparto igualitario replica `REDONDEAR` de Sheets por participante y registra la diferencia de redondeo para conciliación. | Reemplazada por APP-087 |
| APP-031 | Empresa, cuentas y fase se derivan de cuentas vinculadas y telemetría técnica. La revisión manual sólo interviene ante una excepción o conflicto verificable. | Reemplazada para automatización por APP-085 y APP-087 |
| APP-032 | Hasta implementar el flujo de correccion y recalculo historico, Control Diario solo admite nuevas cargas en orden cronologico dentro del periodo. Una fecha anterior al ultimo control confirmado se bloquea en vez de alterar silenciosamente saldos y registros posteriores. | Vigente |
| APP-033 | El estado de una cuenta no se actualizara desde un resultado broker aislado. La regla se aplicara cuando la app pueda calcular el `TOTAL GANANCIA` completo de cada fase; hasta entonces el servicio determinista queda probado pero desconectado de la escritura remota. | Vigente |
| APP-034 | La interfaz de desarrollo de Control Diario guarda movimientos confirmados mediante la transaccion segura del servidor y crea automaticamente los registros por cuenta. Mientras NinjaTrader no este conectado, cada saldo simulado queda identificado por una clave de evento y una observacion de desarrollo. Este guardado no actualiza el estado de las cuentas. | Vigente |
| APP-035 | Registro de Operaciones comienza como una vista de solo lectura por empresa y cuenta. Muestra fase, fecha, rol, origen en Control Diario y magnitudes `NETO BROKER +` o `NETO BROKER -`. Su resumen se denomina resultado broker visible y no se presenta como `TOTAL GANANCIA` ni actualiza el estado mientras falten componentes de la regla completa. | Vigente |
| APP-036 | El primer Resumen de progreso se calcula exclusivamente desde Compras, Control Diario, cuentas y Registro de Operaciones. Mantiene separados saldo, movimientos y resultado operativo; una ausencia de saldo se muestra como dato faltante y no como cero. `TOTAL GANANCIA`, billetera, retiros de fondeo, comisiones y conciliaciones permanecen fuera hasta validar sus reglas completas. | Vigente |
| APP-037 | El detalle consultable de cuenta se integra en Registro y reutiliza la selección por empresa y referencia. Expone compra, precio, origen, estado guardado, actividad, roles y las seis fases. Los valores de fase se denominan subtotales broker visibles y no `TOTAL GANANCIA`; las fases sin actividad permanecen visibles sin inventar importes. | Vigente |
| APP-038 | Inicio presenta una síntesis calculada del período y una única orientación contextual: registrar una cuenta, establecer el depósito inicial o preparar la próxima operación. No reemplaza Resumen ni solicita datos adicionales; sus enlaces conducen al módulo de origen. | Vigente |
| APP-039 | La corrección histórica inicial se limita a saldos confirmados de Control Diario. Reemplaza el saldo visible, recalcula cronológicamente saldos y resultados posteriores, reescribe participantes y registros derivados, y conserva instantáneas internas del antes y después con motivo. Si un retiro queda sin fondos, toda la corrección se revierte; el reparto igualitario usa el redondeo de APP-087. | Vigente |
| APP-040 | El ajuste excepcional por cuenta parte de la distribución automática, exige un motivo y solo se confirma cuando los importes firmados de líder y réplicas suman exactamente el resultado total. La distribución exacta y su motivo quedan auditados. Una corrección histórica que alcance un reparto excepcional se bloquea antes de sobrescribirlo hasta contar con una redistribución explícita aprobada. | Vigente |
| APP-041 | La corrección histórica que afecta repartos excepcionales se realiza en dos pasos: primero calcula todos los resultados posteriores y luego exige revisar cada redistribución afectada. La diferencia se propone inicialmente en la cuenta líder, puede editarse por cuenta y solo se confirma si cada suma coincide exactamente. Saldo, registros derivados y auditoría se actualizan en una única transacción. | Vigente |
| APP-042 | El Historial de actividad del alumno se obtiene mediante una lectura segura y acotada por período propio. Muestra compras, confirmaciones y correcciones con su fecha y motivo, pero no concede acceso a las instantáneas internas de auditoría. Una corrección se distingue visualmente y no aparece como una segunda operación vigente. | Vigente |
| APP-043 | La primera publicación externa se realiza en un proyecto Vercel separado llamado `nodal-app-preview`, conectado exclusivamente a la base Supabase de desarrollo. Sirve para pruebas privadas y demostraciones; no es producción, no contiene datos reales y no reemplaza Sheets. | Vigente |
| APP-044 | `TOTAL GANANCIA` se calcula por cuenta y fase desde sus componentes guardados: en Evaluación es `NETO BROKER + − NETO BROKER -`; en las vueltas se suma además el `TOTAL RETIRO` informado manualmente. La carga de retiro no se infiere desde una fórmula porque el pago real de cada empresa de fondeo puede diferir. | Vigente |
| APP-045 | El estado admite Automático, Forzar Cuenta viva y Forzar Cuenta cerrada. El modo forzado queda guardado y auditado. Forzar viva conserva el arrastre positivo a la siguiente vuelta; al volver a Automático se recupera el estado calculado. | Vigente |
| APP-046 | Resumen Operativo calcula capital, estados, flotante, ganancia realizada, comisión y conciliaciones desde los registros ya existentes. Billetera y retiros de fondeo se guardan como movimientos trazables: un retiro aprobado queda pendiente y solo integra billetera al confirmar su cobro. | Vigente |

| APP-047 | Las alertas iniciales del Resumen se calculan desde datos y diferencias concretas: saldo broker ausente, conciliaciones de capital o ganancias, retiros aprobados sin cobro y estados de cuenta forzados. Informan el origen y conducen a revisarlo; nunca corrigen valores ni marcan un período como cerrado. | Vigente |

| APP-048 | El asistente de alertas opera exclusivamente en lectura. Usa GPT-5.6 Luna con razonamiento bajo y escala automáticamente a GPT-5.6 Terra cuando el diagnóstico no queda verificado por reglas deterministas. Las respuestas se reutilizan mientras el expediente no cambie; ninguna IA puede corregir registros, resolver alertas ni cerrar períodos. | Vigente |
| APP-049 | Las conciliaciones muestran su desglose calculado: componentes observable y esperado para capital, y ganancia cerrada contra reconstrucción para ganancias. Los vínculos llevan a los registros de origen; una diferencia sigue siendo una alerta, nunca un ajuste automático. | Vigente |
| APP-050 | El primer panel administrativo es exclusivamente de lectura. Su vista principal muestra actividad reciente, resultado realizado, capital neto y comisión estimada por alumno; la ficha individual abre el detalle económico calculado. El rol `admin` se asigna fuera del navegador, conserva a los alumnos aislados y no habilita escrituras económicas. | Vigente |
| APP-051 | Un administrador NODAL puede autorizar o revocar exclusivamente alumnos desde el panel, siempre que ya se hayan identificado con Google. El alta prepara sus espacios Real y Práctica para un mes seleccionado; alta, baja y preparación quedan auditadas. No permite administrar otros administradores ni modificar operaciones económicas. | Vigente |
| APP-052 | La integración con NinjaTrader usa un Add On local de NinjaScript y un receptor privado, no una conexión directa del navegador al broker. El inventario real se recibe en modo de solo lectura y queda separado de los registros económicos hasta que la cuenta sea clasificada, la conexión aprobada y el usuario confirme los datos contables requeridos. | Vigente; actualizada por la prueba real del conector |
| APP-059 | Una cuenta nueva detectada en Ninja se presenta primero como pendiente de registro. La primera detección propone la fecha de compra, pero el alumno puede corregirla antes de confirmar. Precio y origen de fondos siguen siendo datos económicos requeridos. La compra manual queda como contingencia y una transición de fase no genera una compra nueva. | Vigente |
| APP-060 | Cada inventario recibido desde el conector de NinjaTrader se conserva en una tabla técnica permanente e idempotente por identificador de evento. La instantánea se atribuye al conector autenticado, registra fecha y cuentas detectadas, pero no crea por sí sola compras ni movimientos económicos. El conector reintenta los envíos fallidos para no depender de que el usuario desconecte y reconecte Ninja. | Vigente; reemplaza su versión basada en Machine ID |
| APP-061 | La identidad principal del conector es el usuario NODAL. El alumno autenticado con Google genera un código temporal de un solo uso y lo ingresa en el complemento; el servidor canjea ese código por credenciales revocables. No se utiliza Machine ID como identidad ni se confía en el nombre declarado de una conexión. | Vigente; reemplaza APP-061 anterior |
| APP-062 | Las cuentas que ve el alumno proceden exclusivamente del último inventario de su conector activo y de conexiones aprobadas. Un usuario sin conector vinculado no ve inventarios y ningún alumno puede consultar los de otro. | Vigente; reemplaza APP-062 anterior |
| APP-063 | Vincular un conector no autoriza todas sus conexiones. Cada identidad o conexión observada se aprueba explícitamente o permanece aislada. Solo las cuentas de conexiones aprobadas pueden entrar al flujo oficial; las conexiones nuevas, paralelas o no revisadas generan una señal administrativa y no afectan compras, saldos, registros ni conciliaciones. | Vigente |
| APP-064 | Solo puede existir un conector activo por alumno. Vincular uno nuevo revoca el anterior. El acceso técnico dura diez minutos y se renueva con una credencial rotativa de hasta noventa días, almacenada con DPAPI para el usuario actual de Windows mediante la interfaz nativa compatible con NinjaTrader. El código temporal se elimina después del canje. No existe una clave universal ni una credencial permanente dentro del código. | Vigente; verificada en la primera vinculación real |
| APP-065 | El conector envia una señal de actividad cada quince segundos y NODAL lo considera sin señal después de sesenta segundos. Su sesión técnica es independiente de la sesión web: cerrar Google o el navegador no detiene el envío mientras NinjaTrader y el complemento sigan funcionando. | Vigente |
| APP-066 | La vinculacion de NinjaTrader es el segundo paso obligatorio del acceso, inmediatamente despues de identidad y autorizacion NODAL. Compras, Control Diario, Registro y Resumen solo se muestran con un conector activo y una señal reciente; una interrupcion no borra datos y el panel administrativo sigue accesible para administradores. | Vigente |
| APP-067 | Administración comparte la navegación lateral, barra superior, temas Noche/Día y lenguaje visual de la aplicación. La revisión de conexiones muestra un único estado inequívoco y deshabilita la acción ya aplicada. Compras distingue una cuenta nueva de una cuenta Ninja ya registrada, evitando duplicados silenciosos. | Vigente |

| APP-053 | Antes del piloto real, la aplicacion privada incorporara una pantalla de recuperacion ante errores, una ruta de salud sin datos privados, cabeceras basicas de proteccion y exclusion de buscadores. La creacion de Produccion seguira siendo un paso externo y separado de Preview, sin copiar datos reales desde Desarrollo sin una decision documentada. | Vigente |

| APP-054 | NODAL App tendra una interfaz privada en dos temas, Noche y Dia. El tema Noche sera inicial, el usuario podra cambiarlo y la eleccion quedara solo en su navegador. El rediseño completo aplica la misma jerarquia visual a Inicio, Compras, Control Diario, Registro, Resumen, Actividad, Administracion y estados de recuperacion, sin modificar flujos, permisos ni calculos. | Vigente |
| APP-055 | El servidor local de desarrollo y el arranque local usaran los certificados de confianza del sistema operativo mediante la opcion segura de Node `--use-system-ca`. No se deshabilitara la validacion TLS. | Vigente |
| APP-056 | La aplicacion privada deja de presentarse como una pagina extensa y adopta el espacio de trabajo aprobado en el mockup: navegacion lateral en escritorio, navegacion inferior en movil, barra superior persistente y una sola vista funcional activa. El cambio reorganiza la interfaz, pero conserva los mismos servicios, calculos, permisos, formularios y registros existentes. | Vigente |
| APP-057 | Durante las pruebas locales, el alumno puede reiniciar exclusivamente los datos del perÃ­odo actual que le pertenece, confirmÃ¡ndolo expresamente. El reinicio elimina los registros de prueba derivados para volver a cargar un caso, conserva los eventos de auditorÃ­a ya emitidos y agrega una traza resumida. La funciÃ³n no se muestra ni se permite desde Preview o ProducciÃ³n. | Vigente |

| APP-058 | El precio de compra de cada cuenta ocupa automáticamente el primer `NETO BROKER -` de Evaluación. Se calcula desde la compra, se muestra como costo inicial en Registro y participa en TOTAL GANANCIA, estado automático, Resumen, Administración y diagnósticos, sin crear una segunda entrada ni exigir una carga manual. | Vigente |

## Propuestas pendientes de decision

| ID | Propuesta | Estado |
|---|---|---|
| APP-P06 | Estrategia de importacion del historico de Sheets. | Abierta |
| APP-P08 | Politica de retencion, exportacion y recuperacion. | Abierta |

## Registro de nuevas decisiones

Cada decision debe indicar fecha, responsable, motivo, alternativas evaluadas,
impacto, estado y decision reemplazada. Una recomendacion tecnica no pasa a
vigente sin aprobacion y evidencia suficiente.
### APP-068 - Clasificación automática limitada a nomenclaturas inequívocas de Ninja

- **Estado:** Aprobada e implementada.
- **Decisión:** El clasificador reconoce automáticamente los prefijos confirmados de Lucid Flex y MAXX, My Funded Futures, Topstep, Funded Futures Family, Tradeify y Take Profit Trader. La salida muestra empresa, producto y fase en inglés (`Evaluation`, `Funded`, `Live`).
- **Límite:** Una cuenta Live numérica de Tradeify permanece clasificada como broker hasta disponer de evidencia adicional que la distinga. Las etiquetas enmascaradas de FundedNext no se usan como regla de Ninja.
- **Motivo:** Evitar que NODAL cree compras o enlaces contables falsos por una coincidencia ambigua.

### APP-069 - Motor determinista de vidas y transiciones Ninja

- **Estado:** Aprobada e implementada en dominio; activación sobre inventarios reales pendiente de validar el campo de saldo.
- **Decisión:** Cada aparición posterior a un reset crea una vida NODAL nueva sin sobrescribir la anterior. La quema se confirma por desaparición y piso vigente; `Evaluation → Funded` se enlaza automáticamente cuando objetivo, cantidades y programa son compatibles; `Funded → Live` siempre requiere confirmación humana.
- **Reglas económicas:** Evaluación 50K inicia con piso US$48.000, mueve el piso únicamente entre jornadas según máximo EOD menos US$2.000 y alcanza objetivo en US$53.001. Funded mueve el piso a US$50.100 al tocar US$52.100, salvo Topstep, que lo hace en US$52.000.
- **Límite:** El motor recibe un saldo de referencia explícito. No selecciona silenciosamente entre `CashValue` y `NetLiquidation` hasta validar cuál corresponde en cada proveedor.

### APP-070 - Activación conservadora del saldo y persistencia de transiciones

- **Estado:** Aprobada e implementada.
- **Decisión:** El procesamiento real solo usa un saldo automáticamente cuando `CashValue` y `NetLiquidation` coinciden al centavo. Si falta uno o difieren, conserva el inventario pero genera revisión y no cambia la vida de la cuenta.
- **Persistencia:** El estado técnico del motor y sus eventos se guardan por conector con revisión optimista y confirmación atómica. Las alertas automáticas y las que requieren intervención se muestran en Inicio.
- **Separación:** Detectar una transición no modifica por sí solo compras, controles ni registros económicos. Las acciones económicas se incorporarán mediante funciones transaccionales específicas después de validar el evento.

### APP-071 - Resolución económica transaccional de eventos Ninja

- **Estado:** Aprobada e implementada.
- **Automático:** Una quema confirmada por el motor cierra el vínculo y la cuenta. Un cambio coherente `Evaluation → Funded` cierra el vínculo externo anterior y crea el nuevo sobre la misma cuenta NODAL, preservando continuidad.
- **Confirmación:** `Funded → Live` y una desaparición sin evidencia suficiente requieren decisión del alumno. Confirmar o descartar queda auditado.
- **Reset:** Aunque la detección sea automática, el usuario debe informar fecha, precio y origen de fondos. La transacción cierra la vida anterior y crea una nueva cuenta y compra correlativa sin sobrescribir el historial.
### APP-072 - Los saldos broker de Ninja ingresan por una bandeja confirmable

- Estado: Decidido e implementado en desarrollo.
- Fecha: 2026-08-28.
- La fuente automática de Control Diario es la suma de las cuentas clasificadas
  como broker dentro de conexiones aprobadas. Las cuentas prop y simuladas no
  forman parte de ese saldo.
- Un saldo solo se considera verificable cuando `CashValue` y `NetLiquidation`
  coinciden al centavo en todas las cuentas broker incluidas. Ante una
  inconsistencia no se genera un total parcial.
- Cada cambio se conserva en una bandeja idempotente. El alumno revisa empresa,
  líder, réplicas y fase antes de crear el Control Diario y sus registros.
- La recepción sigue existiendo aunque la app no esté abierta. Confirmar o
  corregir el dato vincula de forma auditable el evento de Ninja con el Control
  Diario resultante.
- El complemento vuelve a revisar el inventario en cada señal de actividad. De
  este modo detecta conexiones o cuentas agregadas y retiradas aunque el
  proveedor no emita un aviso de cambio; la huella del inventario evita envíos
  duplicados cuando nada cambió.
- La bandeja pendiente se consulta mediante una función de base de datos que
  devuelve exclusivamente el evento más antiguo del conector perteneciente al
  usuario autenticado.

### APP-073 - Sistema visual único para acciones

- **Estado:** Aprobada e implementada.
- **Fecha:** 2026-08-30.
- **Decisión:** Todos los botones de acción comparten altura, radio, tipografía,
  alineación, foco, hover, pulsación y estado deshabilitado. Se reconocen cuatro
  familias: principal verde, secundaria de vidrio, destructiva roja y acción
  terciaria de texto.
- **Excepciones:** Google conserva su fondo blanco de proveedor, pero utiliza la
  misma geometría e interacción. Navegación, pestañas e iconos compactos no se
  tratan como botones de acción y mantienen dimensiones propias.

### APP-074 - Identidad visible y encabezado reducido del alumno

- **Estado:** Aprobada e implementada.
- **Fecha:** 2026-08-30.
- **Decisión:** El encabezado del alumno muestra nombre de usuario y foto de
  perfil, y elimina la fecha redundante y la leyenda de espacio personal. La
  barra lateral conserva el cierre de sesión sin textos promocionales. Inicio
  elimina el subtítulo introductorio para reducir ruido visual.
- **Alcance:** Estructura compartida por todas las vistas del alumno y por los
  temas diurno y nocturno.

### APP-075 - Inicio prioriza resultado, capital y rendimiento histórico

- **Estado:** Aprobada e implementada.
- **Fecha:** 2026-09-03.
- **Decisión:** Inicio muestra como resultado neto la ganancia realizada de
  cuentas cerradas del período seleccionado, el capital neto aportado del
  período, la cantidad de payouts registrados y las métricas de mejor jornada,
  peor jornada y promedio diario calculadas desde controles confirmados.
- **Histórico:** El gráfico presenta exclusivamente capital neto acumulado mes
  a mes para la modalidad activa. No mezcla capital, flujo y resultado ni
  ofrece un selector entre magnitudes distintas.
- **Presentación:** La pantalla conserva el sistema visual vigente de NODAL y
  elimina saludos, próximos pasos y textos introductorios del panel anterior.

### APP-076 - Un conector vinculado sin señal no bloquea la consulta

- **Estado:** Aprobada e implementada.
- **Fecha:** 2026-09-03.
- **Decisión:** La vinculación inicial con NinjaTrader continúa siendo
  obligatoria. Una vez que existe un conector activo, la ausencia temporal de
  señal no bloquea el ingreso: el alumno puede consultar los últimos datos
  guardados y recibe un aviso visible de desconexión.
- **Actualización:** El panel continúa consultando el estado del conector y se
  refresca automáticamente cuando la señal reaparece o se pierde.

### APP-077 - Administración Master de mesas y acuerdos individuales

- **Estado:** Implementada y publicada en la preview el 2026-09-07; migración aplicada a la base de desarrollo. Verificada con sesión Master: carga de datos, temas día/noche, apertura de mesa y ficha de usuario sin modificar condiciones reales. La prueba de ramas anidadas con datos reales queda pendiente: no hay mesas derivadas creadas.
- **Decisión de producto:** Confirmada por Mauricio en este hilo. El administrador de mesa siempre conserva su condición de operador y su mesa de pertenencia hasta un traslado explícito. Administrar una mesa no concede el rol global `admin`.
- **Relaciones separadas:** Pertenencia operativa versionada por usuario, administración versionada de mesa y origen permanente de la mesa. Trasladar a una persona no mueve su workspace, cuentas ni registros históricos.
- **Comisiones:** Acuerdo individual y acuerdo de mesa independientes, establecidos por Master. El acuerdo individual reemplaza los tramos/topes históricos solamente desde su vigencia; los períodos anteriores y usuarios sin acuerdo explícito conservan el cálculo anterior. Se comparte el cálculo entre admin, ficha y resumen operativo. Esta decisión sustituye las propuestas anteriores incompatibles sobre exención del administrador o comisión uniforme; no modifica las fuentes ni planillas de producción.
- **Bonus:** Solo mesas directas activas. 1–2: 15%; 3–4: 30%; 5–9: 40%; 10 o más: 50%. Sustituye el porcentaje anterior, no se acumula, y se descuenta de la participación NODAL de cada mesa hija. La ganancia bruta global no suma distribuciones internas nuevamente.
- **Ingreso total:** Participación de operativa propia + participación de mesa + bonus. Es ingreso calculado, no certificación de cobro. Se presenta en la tarjeta de la persona que administra la mesa.
- **Gestión:** Guardar aplica al período calendario actual en Buenos Aires; no hay edición de períodos anteriores ni programación futura desde esta interfaz. La pantalla de períodos históricos es de consulta. No se inventa una política de cierre contable.
- **Historial:** Registros automáticos con actor, fecha, vigencia y valores anteriores/nuevos para condiciones personales, reemplazo de administrador y cambios de escala de bonus. La interfaz carga los 500 eventos globales más recientes; la tabla conserva todos.
- **Interfaz:** Totales y mesa principal arriba, mesas derivadas en grilla debajo y gráfico por período. Tocar la tarjeta abre su mesa; `Ver` despliega la rama sin navegar. Árbol de altura acotada con scroll vertical e indentación adaptable. Colores heredados del tema día/noche; diálogos nativos con foco y Escape.
- **Navegación Master:** `Usuarios` y `Conectores Ninja` dejan de ser secciones principales. La tabla y las fichas de usuario viven en `Vista general`; altas/bajas y excepciones del conector se conservarán como funciones internas hasta integrarlas de forma contextual, sin perder sus rutas ni datos durante la transición.
- **Sin datos ficticios:** Solo se crea la mesa principal vacía. No se asignan porcentajes a usuarios existentes ni se crean Carlos/Pepito como datos reales.
- **Pendiente real:** La app no identifica períodos formalmente cerrados. Por eso no se activa la marca de sugerencia de ascenso, aunque existe la regla determinista; nivel manual disponible. El panel reducido y permisos específicos del administrador de mesa siguen pendientes de definición.
- **Verificación:** Pruebas unitarias de porcentajes, conservación de distribuciones e historial por período; integración SQL transaccional con rollback para permisos, auditoría, duplicidad de administradores y protección de períodos anteriores. Se aplicó únicamente `20260907000000`; tres migraciones antiguas pendientes en remoto quedaron intactas.

### APP-078 - Telemetría técnica para delimitar operaciones Ninja

- **Estado:** Aprobada para prueba el 2026-09-07.
- **Decisión:** El conector registra ejecuciones, cambios de posición y muestras
  acotadas de saldo en una cola local cifrada e idempotente. La igualdad entre
  `CashValue` y `NetLiquidation` no demuestra por sí sola el cierre.
- **Criterio de prueba:** La operación queda abierta mientras exista al menos una
  posición no `Flat`. Tras volver todas a `Flat`, se exige una muestra de saldo
  posterior y diez segundos sin eventos para mostrar `Flat estable`.
- **Límite:** Esta telemetría no crea compras, Control Diario, registros ni
  movimientos económicos. La automatización contable queda pendiente de una
  prueba real y conciliación aprobada.
- **Prueba real 2026-09-07:** Sim101 registró entrada, posición `Long`, salida,
  posición `Flat` y saldo final de USD 100.000,50. Se detectó y corrigió que las
  muestras de saldo sin cambios saturaban la lectura: el conector deja de
  reenviarlas, el servidor colapsa duplicados consecutivos como defensa y la
  consulta reserva visibilidad para ejecuciones y posiciones.
- **Excepción experimental:** Se habilita únicamente la combinación exacta del
  conector de Mauricio, conexión `Ninja Mauri` y cuenta `Sim101`. El servidor
  persiste ciclos técnicos con saldo inicial/final, resultado, ejecuciones e
  instrumentos. El latido del conector completa el cierre tras diez segundos
  estables aunque el usuario no tenga abierta su sesión web. Sigue prohibido
  generar movimientos económicos a partir de esta prueba.

### APP-079 - Recorrido contable centrado en automatización

- **Estado:** Implementada el 2026-09-07.
- **Decisión:** Compras prioriza las cuentas detectadas por NinjaTrader y las
  cuentas ya registradas; la carga manual queda como contingencia plegada.
  Control Diario prioriza la operación detectada, su configuración y el último
  saldo confirmado; los movimientos manuales quedan en un control secundario.
  Registro prioriza el resultado, los netos broker y los totales por fase; el
  cambio manual de estado queda como ajuste excepcional plegado.
- **Presentación:** Los tres paneles usan la jerarquía visual del Inicio vigente:
  fondos de la aplicación, tarjetas compactas, un único título y datos antes que
  explicaciones. Se eliminan eyecatches, subtítulos descriptivos y distintivos
  de implementación que no ayudan a decidir ni operar.
- **Límite económico:** Este cambio reorganiza la interfaz y no altera las
  reglas contables. La telemetría experimental de APP-078 continúa sin crear
  movimientos económicos ni registros automáticos hasta completar la
  conciliación correspondiente.

### APP-080 - Navegación personal por función y no por planilla

- **Estado:** Implementada el 2026-09-07. Corrige el alcance incompleto de
  APP-079, que había modificado la jerarquía visual sin reemplazar las secciones
  heredadas de Excel.
- **Navegación:** El espacio personal queda reducido a `Inicio`, `Cuentas`,
  `Operaciones` y `Contabilidad`. `Compras`, `Control Diario`, `Registro`,
  `Resumen Operativo` y `Actividad` dejan de ser destinos independientes.
- **Cuentas:** Reemplaza Compras. La detección de NinjaTrader es el ingreso
  principal y la carga manual permanece como contingencia.
- **Operaciones:** Unifica la operación detectada, su configuración, saldo,
  controles internos, distribución y resultados por cuenta. Control Diario y
  Registro siguen existiendo como estructuras internas auditables, no como dos
  tareas consecutivas del usuario.
- **Contabilidad:** Reúne capital, billetera, retiros, resultados,
  conciliaciones e historial económico. El historial queda contextual y no
  ocupa una sección principal.
- **Compatibilidad:** Los hashes antiguos siguen resolviendo a la sección nueva
  correspondiente para no romper enlaces guardados. Todos los enlaces internos
  nuevos usan exclusivamente la navegación vigente.

### APP-081 - Período automático y reducción de controles heredados

- **Estado:** Implementada el 2026-09-08.
- **Contexto operativo:** La interfaz personal deja de ofrecer el selector
  `Real / Práctica` y el cambio global de período. La aplicación trabaja sobre
  el workspace real y su período más reciente. La modalidad de práctica y los
  períodos continúan existiendo internamente para pruebas, trazabilidad e
  históricos; no se eliminan registros ni reglas contables.
- **Inicio:** El período queda representado por el eje temporal del gráfico.
  Payouts y métricas de rendimiento sin datos no ocupan espacio.
- **Cuentas:** NinjaTrader muestra solamente nuevas detecciones o su estado de
  señal. Las cuentas registradas no se repiten. El importe agregado se presenta
  como capital invertido y la ficha, estado, fases y resultados por cuenta viven
  en esta sección. La carga manual continúa plegada como contingencia.
- **Operaciones:** Conserva la operación detectada, el saldo broker y su
  historial. La asignación de cuentas queda plegada mientras sea necesaria para
  la transición hacia rutas guardadas. Los datos técnicos de NinjaTrader y los
  ajustes manuales se muestran bajo demanda. Se elimina el indicador técnico
  `En línea`, que podía contradecir el estado real del conector.
- **Navegación:** Una actualización del estado del conector conserva la sección
  activa; no devuelve al usuario a Inicio ni pierde el fragmento de navegación.
- **Contabilidad:** Muestra saldos, resultado y comisión de usuario. Las
  conciliaciones se pliegan cuando no existen diferencias y los formularios de
  billetera y retiros aparecen como acciones bajo demanda. El antiguo historial
  combinado se retira porque mezclaba compras y controles en una sección que
  debía contener solamente hechos económicos.
- **Límite:** No se modifican cálculos, tablas, telemetría ni automatizaciones.
  Varias billeteras y rutas operativas persistentes siguen siendo evoluciones
  pendientes del modelo de datos.

### APP-082 - Simulación de escala antes de reemplazar las vistas contables

- **Estado:** Implementada el 2026-09-08 para validación de producto.
- **Fuente de escala:** Se revisaron en modo lectura las planillas reales vigentes
  de dos usuarios. El escenario adopta el caso más exigente observado: 43
  cuentas, de las cuales 34 están cerradas, 8 vivas y 1 virgen, y 79 operaciones.
  La aplicación no copia nombres, correos, identificadores de cuenta ni registros
  literales de esas planillas.
- **Aislamiento:** `/app/demo` usa datos ficticios en memoria y no expone
  formularios ni acciones de servidor. No escribe en Supabase, Google Sheets ni
  en las planillas de producción. En producción requiere una sesión NODAL
  autorizada; en desarrollo local sólo muestra el escenario ficticio.
- **Temporalidad simulada:** El escenario distribuye actividad entre julio de
  2026, cerrado, y agosto de 2026, actual. Inicio representa ambos en el gráfico;
  las fichas de cuenta conservan su período de origen; Operaciones agrupa el
  historial por período y Contabilidad permite comparar ambos cierres sin
  recuperar un selector global.
- **Cuentas:** La propuesta separa indicadores, filtros, cuentas en curso, cuentas
  sin operar y cerradas. Las cerradas nacen plegadas, se cargan visualmente en
  bloques de ocho y cada cuenta revela su ficha sin navegar a otra pantalla.
- **Operaciones:** La propuesta mantiene visible sólo la operación actual y el
  saldo necesario para decidir. Revisiones, asignación e historial quedan
  agrupados y desplegables; el histórico se organiza por día y deja los bloques
  anteriores cerrados.
- **Inicio:** Se restaura la composición aprobada anterior a APP-081: Resultado
  neto, Capital neto total, Payouts, gráfico histórico y las tres métricas de
  rendimiento permanecen visibles aunque todavía no tengan datos.
- **Límite:** Esta simulación sirve para evaluar experiencia y densidad. No
  reemplaza todavía las vistas reales de Cuentas u Operaciones ni modifica reglas
  contables; ese reemplazo requiere aprobación visual del escenario.

### APP-083 - Simulación contable calculada con el dominio real

- **Estado:** Implementada el 2026-09-08.
- **Corrección:** Se eliminan los totales económicos independientes escritos a
  mano en `/app/demo`. Cuentas, controles, entradas del registro, retiros,
  saldos, capital, conciliaciones, facturación y comisiones nacen de un único
  escenario ficticio y se procesan con los servicios de dominio vigentes.
- **Comisión:** El usuario simulado tiene un acuerdo individual explícito del
  50%. En agosto, una facturación de USD 12.000 produce USD 6.000 de comisión y
  USD 6.000 de ganancia propia para el usuario. No se aplican escalas ni topes
  heredados porque el acuerdo individual los reemplaza.
- **Nombres:** `Facturación` identifica la ganancia realizada de cuentas
  cerradas y la base de comisión. `Resultado del período` conserva el resultado
  económico del período. Se muestran por separado porque compras, retiros,
  cuentas abiertas y cuentas vírgenes pueden hacer que difieran.
- **Verificación:** La prueba del escenario exige conciliación sin diferencias,
  comisión y ganancia correctas, resultados de cada cuenta derivados del
  registro, 43 cuentas, 79 operaciones y continuidad del capital entre los dos
  períodos.
- **Límite:** La simulación muestra una sola billetera porque varias billeteras
  todavía no forman parte del modelo real. Agregar una división ficticia habría
  ocultado ese pendiente en vez de ayudar a detectarlo.

### APP-084 - Dashboard personal de ingresos y capacidades

- **Estado:** Implementado el 2026-09-08 en la simulación para validación visual.
- **Ganancias del período:** Reemplaza `Resultado neto`. Es la suma de la
  participación del usuario en su operativa propia después de comisión, su
  participación por administrar una mesa y su bonus por mesas directas
  referidas. Los dos últimos componentes sólo se muestran cuando están
  habilitados para esa persona. El nivel vigente aparece en la misma tarjeta.
- **Facturación del período:** Es la suma del resultado bruto de las cuentas
  cerradas y corresponde a `Resumen operativo!O6` en la planilla. La simulación
  lo obtiene de `realizedGainInCents`: USD 10.500 en julio y USD 12.000 en
  agosto. `Capital neto aportado` conserva su significado contable independiente:
  aportes propios menos retiros personales.
- **Payouts:** Presenta cantidad registrada, importe total y cantidad pendiente
  como tres datos diferenciados.
- **Capacidades:** Mesa administrada, mesas referidas e identidades son tarjetas
  opcionales e independientes. La simulación habilita las tres para revisar su
  convivencia; la aplicación real deberá recibir permisos y agregados desde el
  servidor y no inferirlos desde el rol visible.
- **Histórico:** El gráfico permite alternar, sin cambiar de página, entre
  ganancias totales por período y facturación por período.
  Cada punto expone mes e importe al enfocarlo o apoyar el cursor.
- **Escenario económico de validación:** En agosto el usuario factura USD
  12.000 y conserva USD 6.000 tras su comisión individual del 50%. Su mesa
  directa tiene tres usuarios que facturan USD 10.000 cada uno: generan USD
  15.000 de comisión y el administrador recibe el 70%, USD 10.500. Existen dos
  mesas hijas directas con tres usuarios de USD 10.000 cada una. Cada mesa hija
  genera USD 15.000 de comisión; el 35% son USD 5.250 y el bonus del 15% paga
  USD 787,50 por mesa, USD 1.575 en total. La ganancia total del período es USD
  18.075. Los administradores de las mesas hijas permanecen como usuarios de la
  mesa de origen.
- **Alcance:** Sustituye para Inicio la presentación aprobada en APP-075. Las
  métricas contables originales siguen disponibles en Contabilidad y conservan
  sus reglas de conciliación.

### APP-085 - La cuenta observada es la unidad de la operación automatizada

- **Estado:** Aprobada el 2026-09-08 e implementada en la simulación y en el
  dominio técnico de telemetría. La conversión automática a registros
  económicos reales continúa condicionada a la conciliación del piloto.
- **Unidad:** Cada combinación de conector, conexión y cuenta NinjaTrader se
  procesa de manera independiente. Su propio ciclo de posición, ejecuciones y
  saldo determina apertura, estabilización, cierre y resultado.
- **Simultaneidad:** Si cinco cuentas operan al mismo tiempo, NODAL conserva
  cinco operaciones técnicas individuales. El backend correlaciona, sin
  intervención del usuario, las cuentas prop en la misma dirección con la
  cobertura broker opuesta cuando coinciden apertura, instrumento y cantidad.
- **Correlación operativa:** Cuando Replikanto abre la misma posición en varias
  cuentas prop y la cobertura opuesta en broker, el lote automático conserva
  sus integrantes y distribuye el resultado broker entre las cuentas prop como
  hacía la planilla. El reparto usa redondeo de Sheets y guarda la diferencia de
  redondeo para conciliación.
- **Sin asignación:** El flujo automático no exige elegir líder, réplicas ni
  grupo antes o después de operar. Esta decisión sustituye esa parte del
  recorrido propuesto en APP-079, APP-080, APP-081 y APP-082.
- **Persistencia:** El lote sí se persiste como vínculo técnico y económico
  auditable; no es una configuración manual ni una instrucción para Replikanto.
  Una cuenta broker no puede participar en dos lotes activos simultáneos.
- **Compatibilidad:** Los controles históricos que ya contienen líder y
  réplicas conservan su estructura y auditoría. No se reinterpretan ni se
  reescriben. Los formularios heredados permanecen como contingencia interna
  hasta que el piloto permita reemplazar su escritura económica con seguridad.

### APP-086 - Banco de pruebas contable integral y reversible

- **Estado:** Implementado el 2026-09-08 dentro de `/app/demo`.
- **Objetivo:** La simulación permite validar entradas y salidas económicas, no
  solamente observar una composición visual con números fijos.
- **Entradas:** Compras con aporte o saldo generado, depósitos broker desde
  aporte o billetera, retiros broker hacia billetera o personales, resultado
  individual de una cuenta, payout aprobado, payout cobrado, aporte externo y
  retiro personal de billetera.
- **Salidas:** Saldo broker, billetera, payouts pendientes, capital neto,
  resultado del período, flotante, ganancia realizada, comisión, ganancia del
  usuario y ambas diferencias de conciliación.
- **Cálculo:** Cada entrada se procesa con los servicios deterministas vigentes
  de saldo, resultados por fase, resumen operativo, comisión y rendimiento. El
  payout aprobado también actualiza el `TOTAL RETIRO` de su cuenta; registrar
  solamente el pendiente produciría una diferencia de conciliación.
- **Aislamiento:** Los cambios viven únicamente en memoria, separados por julio
  y agosto. Se pueden restablecer y nunca escriben en Supabase, Sheets ni datos
  de usuarios.

### APP-087 - Equivalencia contable de la automatización con la planilla

- **Estado:** Implementada el 2026-09-08; requiere ejecución paralela antes de
  reemplazar la planilla de producción.
- **Redondeo:** Todo reparto igualitario se redondea por participante como
  Google Sheets (`REDONDEAR(resultado / cantidad; 0)`). La diferencia entre la
  suma repartida y el total recibido queda visible para conciliación.
- **Fases:** Una pérdida de una fase se arrastra con signo negativo a la fase
  siguiente. Un resultado positivo sólo se arrastra cuando el origen fue
  marcado explícitamente como `manual_live`.
- **Payout:** Aprobar un payout registra su fase, incrementa atómicamente el
  retiro acumulado de esa fase y recalcula el estado de la cuenta.
- **Períodos:** El primer control de un período parte del último saldo broker
  confirmado del período anterior; capital, billetera, resultado acumulado y
  cobros pendientes también conservan su saldo de apertura.
- **Cierre técnico:** `CashValue = NetLiquidation` no prueba el cierre. El
  inventario sólo detecta cuentas; la escritura económica usa el ciclo técnico
  de posición, dirección, cantidad, ejecuciones y estabilización.

### APP-088 - Administrar una mesa es una capacidad adicional

- **Estado:** Permiso implementado el 2026-09-09 y consumido por el panel
  restringido definido en APP-089.
- **Identidad:** El administrador de mesa conserva su acceso personal, opera
  normalmente y permanece en la mesa de origen definida por sus propios
  términos. No se transforma en Admin Master.
- **Fuente:** La capacidad nace exclusivamente de la asignación vigente y activa
  `manager_id` de `nodal_desk_terms`. Reemplazar o revocar al administrador
  actualiza el permiso sin modificar su historial ni su pertenencia operativa.
- **Alcance:** El servidor distingue `master`, `desk` y `none`. El alcance
  `desk` identifica una única mesa administrada; no concede lectura global ni
  habilita las funciones reservadas al Admin Master.
- **Seguridad:** La resolución se ejecuta en la base para el usuario autenticado.
  No acepta un identificador de usuario o mesa enviado por el navegador y no
  abre políticas generales de lectura sobre las tablas administrativas.

### APP-089 - Panel restringido del administrador de mesa

- **Estado:** Implementado el 2026-09-09.
- **Acceso:** Un administrador de mesa vigente ve `Mi mesa` en su navegación
  personal y puede entrar aunque el conector Ninja esté temporalmente sin señal.
  Un Admin Master continúa usando exclusivamente `/app/admin`.
- **Datos:** El panel muestra el período real actual, usuarios directos,
  facturación, comisión generada, ganancias del administrador y el árbol de
  mesas derivadas de su propia rama. La ficha desplegable de cada usuario resume
  cuentas y payouts sin abrir otra página.
- **Nivel:** La tabla conserva el nivel vigente y marca visualmente una posible
  promoción cuando los dos períodos anteriores alcanzan la referencia. La marca
  es informativa y no modifica el nivel.
- **Límites:** No contiene controles para porcentajes, niveles, estados,
  movimientos de usuarios, creación o revocación de mesas. Esas decisiones
  permanecen en el Admin Master.
- **Aislamiento:** La lectura privilegiada ocurre sólo en el servidor después de
  resolver la mesa desde la sesión autenticada. La ruta no acepta un id de mesa
  elegido por el navegador y vuelve a verificar que la asignación siga activa.

### APP-090 - El dashboard personal usa la economía real de mesas

- **Decisión:** `Ganancias del período` se calcula con la estructura vigente del
  período: ganancia propia luego de comisión, ingreso por administración de la
  mesa y bonus por mesas directas referidas. Los dos últimos conceptos sólo se
  muestran cuando corresponden al usuario.
- **Capacidades:** La tarjeta de mesa administrada muestra usuarios y facturación
  real de esa mesa. La tarjeta de mesas referidas muestra únicamente las mesas
  hijas directas y el tramo de bonus vigente.
- **Historial:** El gráfico reconstruye facturación y ganancia total para cada
  período real disponible del usuario, aplicando los términos históricos de ese
  mes.
- **Seguridad:** La reconstrucción global se ejecuta sólo en servidor con una
  identidad privilegiada, después de autenticar al usuario, y entrega al cliente
  únicamente sus agregados personales.
- **Estado:** Implementado el 2026-09-09.

### APP-091 - Las vistas reales adoptan la estructura aprobada en la simulación

- **Cuentas:** Conserva detección y alta real, agrega métricas y filtros, separa
  activas y vírgenes, y mantiene las cerradas plegadas con carga de ocho en ocho.
  Cada fila se abre para mostrar estado, fase, compra, cantidad de operaciones y
  resultado calculado por los servicios contables vigentes.
- **Operaciones:** Presenta telemetría Ninja en tarjetas, distingue cuentas prop
  y broker mediante el inventario detectado, muestra saldos, posición, duración
  e historial. Los ajustes y el resultado detallado por cuenta permanecen
  disponibles, pero plegados como funciones de excepción.
- **Contabilidad:** La cabecera prioriza facturación, resultado del período,
  saldo broker, comisión y ganancia del usuario. Muestra dos períodos y repliega
  los anteriores; saldos secundarios, retiros, movimientos y conciliaciones se
  mantienen en secciones desplegables.
- **Lógica:** No se trasladan números ni acciones exclusivas de la simulación.
  Todas las cifras provienen de registros reales y de los servicios contables
  ya conciliados.
- **Estado:** Implementado el 2026-09-09.

### APP-092 - Automatización Ninja general con conciliación previa

- **Captura:** Las operaciones técnicas dejan de depender de una allowlist para
  cuentas reales. Entran las cuentas prop vinculadas y los brokers clasificados
  inequívocamente dentro de conexiones aprobadas. `Sim101` conserva la
  allowlist únicamente como excepción de prueba.
- **Alcance de riesgo:** Empresa, producto, fase y tamaño forman parte de la
  identidad del programa. Las reglas automáticas de piso y transición se
  aplican exclusivamente al alcance confirmado de USD 50.000; un tamaño futuro
  sin regla aprobada no se mezcla ni se automatiza.
- **Lotes:** Cada cuenta conserva su operación técnica individual. El backend
  correlaciona prop y cobertura por apertura, instrumento, dirección opuesta y
  cantidad, sin pedir líder ni grupo al usuario. Los vínculos históricos se
  resuelven según la fecha de la operación, incluso si después cerraron.
- **Proyección contable:** Un lote sólo queda `shadow_ready` si sus cuentas
  comparten período, empresa y fase; existen saldos broker inicial y final; el
  saldo inicial coincide con el último saldo contable; y resultado y reparto
  concilian. De lo contrario queda bloqueado con una causa concreta.
- **Períodos y fases:** Evaluación se deriva automáticamente. Una vuelta funded
  sólo se reutiliza cuando ya existe evidencia contable de esa vuelta; la app no
  inventa el avance entre vueltas.
- **Activación:** La escritura económica permanece en modo paralelo (`shadow`).
  Punto 6 deberá comparar períodos completos contra Sheets antes de habilitar
  la creación automática de Control Diario y Registro.
- **Trazabilidad visible:** Contabilidad reúne depósitos broker, retiros broker,
  billetera y estados de payout en una cronología plegada, conservando origen,
  fecha y estado. Los movimientos sin fuente externa fiable siguen siendo
  manuales y auditados.
- **Estado:** Implementado el 2026-09-09 en modo paralelo; activación económica
  pendiente de conciliación.

### APP-093 - Saldo broker vivo separado del saldo contabilizado

- **Dato vivo:** `Cash Value` de las cuentas broker conectadas al conector activo se
  muestra como saldo broker en vivo. No se exige que coincida con Net
  Liquidation, porque esa igualdad no demuestra el cierre de una operación.
- **Dato contable:** El último saldo confirmado de Control Diario permanece
  separado y se identifica como contabilizado. Mostrar el saldo vivo nunca
  crea por sí mismo un depósito, retiro ni resultado operativo.
- **Actualización:** La vista consulta cada quince segundos el último inventario
  del conector y conserva el último dato ante una interrupción transitoria.
- **Cierre:** La propuesta de registro económico continúa dependiendo del lote
  técnicamente cerrado y conciliado de APP-092. Su activación automática queda
  condicionada a la comparación integral del punto 6.
- **Interfaz:** Operaciones y Contabilidad comparten una sola familia
  tipográfica, jerarquías y alineaciones. Las tarjetas de período no truncan
  importes y ocupan el ancho disponible cuando sólo existe un período.
- **Estado:** Implementada el 2026-09-09.

### APP-094 - Supervisión remota de pruebas Ninja por usuario

- **Identidad:** Cada prueba pertenece al usuario que vinculó el conector desde
  su sesión. El inventario, la telemetría y los lotes de Ivo no se combinan con
  el espacio ni con las cuentas de Mauricio.
- **Precondiciones:** Admin Master ve en la ficha del usuario si existe el
  período actual, el conector está en línea, hay conexiones activas,
  hay exactamente un broker con cuentas prop y las prop ya fueron incorporadas.
- **Observación:** La ficha muestra el último inventario, operaciones técnicas y
  conciliaciones automáticas con su causa de bloqueo. Se actualiza cada cinco
  segundos para permitir que el operador trabaje desde otra computadora.
- **Seguridad:** La consulta es de solo lectura, exige rol Admin Master en el
  servidor y recibe un único usuario objetivo. No permite corregir ni crear
  movimientos económicos.
- **Activación:** La supervisión conserva `accounting_mode = shadow`; observar
  un lote conciliado no lo transforma en un asiento contable.
- **Estado:** Implementada el 2026-09-09 como preparación para la prueba integral
  de Ivo.

### APP-095 - Alta y distribución del conector para pruebas remotas

- **Acceso pendiente:** Un usuario autenticado pero todavía no autorizado ve una
  pantalla independiente y centrada. El dashboard y el estado del conector no se
  renderizan hasta que NODAL habilita el acceso.
- **Distribución:** La pantalla de conexión ofrece un ZIP descargable desde la
  propia aplicación. Incluye el conector, el instalador y las instrucciones; no
  contiene credenciales ni códigos de vinculación.
- **Vinculación:** El código temporal continúa generándose dentro de la sesión
  del usuario y se ingresa localmente en la PC donde corre NinjaTrader.
- **Seguridad:** El complemento sigue siendo de solo lectura y la autorización
  del usuario permanece separada de la autenticación de Google.
- **Estado:** Implementada el 2026-09-09 para iniciar la prueba integral desde la
  PC de Ivo.

### APP-096 - Sincronización visible sin recarga manual

- **Inventario:** La web compara cada cinco segundos una revisión estructural de
  las cuentas del conector activo. Una cuenta nueva, una desconexión o un
  aislamiento administrativo actualiza la vista sin que el usuario presione F5.
- **Saldos:** Los cambios exclusivos de saldo no recargan toda la página; se
  distribuyen a los paneles vivos mediante el evento del conector.
- **Dashboard:** Inicio muestra el estado de NinjaTrader y el saldo broker vivo
  como dato operativo separado. Las ganancias, facturación y comisiones siguen
  siendo cifras contables y no se sustituyen por movimientos intradía.
- **Frecuencia:** El navegador consulta cada cinco segundos. La recarga completa
  sólo ocurre ante un cambio estructural, para evitar parpadeos durante un trade.
- **Estado:** Implementada el 2026-09-10.

### APP-097 - Autorización única por usuario y conector Ninja

- **Frontera de acceso:** Admin Master autoriza el ingreso del usuario a NODAL
  una sola vez. El código de vinculación emitido desde esa sesión asocia el
  conector con ese usuario autorizado.
- **Inventario automático:** Toda conexión y cuenta que NinjaTrader informe
  posteriormente desde el conector activo se incorpora automáticamente. No se
  solicita una aprobación adicional por empresa, cuenta o nombre de conexión.
- **Excepción:** Admin Master puede aislar expresamente una conexión observada
  si pertenece a otra persona o contamina la prueba. La ausencia de revisión
  significa activa, no pendiente.
- **Alcance:** La regla se aplica a inventario visible, detección de compras,
  saldo broker, transiciones de cuentas y procesamiento técnico de operaciones.
- **Seguridad:** Registrar una compra sigue exigiendo que la cuenta exista en el
  inventario recibido del conector autenticado del propio usuario.
- **Estado:** Implementada el 2026-09-10.

### APP-098 - Respaldo para órdenes del Panel Central

- **Hallazgo:** Google Apps Script limita a 20 los disparadores por usuario y
  proyecto. Al alcanzar ese límite, el disparador de edición del Panel Central
  puede no estar disponible y una orden de creación queda pendiente.
- **Decisión:** La tarea central existente también revisa y procesa, en orden,
  hasta tres acciones pendientes del panel. Es un respaldo del disparador de
  edición, no un camino paralelo que cree registros duplicados.
- **Trazabilidad:** Cada acción conserva el mismo resultado, fecha de
  aprovisionamiento y mecanismo de reanudación por enlace que el flujo normal.
- **Estado:** Implementada y verificada con la creación de las planillas Real y
  Práctica de David el 2026-09-10.

### APP-099 - Asignación manual de coberturas a cuentas sin telemetría prop

- **Caso:** Una cobertura broker puede quedar sin cuentas compatibles cuando
  las cuentas prop fueron creadas manualmente y se operaron desde otro Ninja.
- **Decisión:** El usuario selecciona las cuentas que participaron desde la
  propia cobertura pendiente. Si el mismo resultado ya posee un Control Diario
  con esas cuentas, NODAL sólo lo vincula; si falta, crea un único control y
  reparte el resultado con el redondeo vigente.
- **Cierre:** La asignación permite indicar expresamente que el trade cerró las
  cuentas. No se infiere una quema sin telemetría ni confirmación del usuario.
- **Trazabilidad:** La cobertura, el control, las cuentas, el reparto, la
  reutilización y el cierre opcional quedan auditados e idempotentes.
- **Estado:** Implementada el 2026-09-17 durante la prueba integral de Ivo.

### APP-100 - Reconstrucción inicial como apertura resumida

- **Decisión:** Un usuario nuevo elige entre iniciar desde cero o reconstruir
  su situación vigente. La confirmación crea una única apertura auditable para
  el período Real y sólo se admite antes de que exista actividad económica.
- **Contabilidad:** La apertura conserva ubicación del dinero, capital neto,
  payouts pendientes, resultado realizado anterior y flotante. No inventa
  trades históricos ni los usa para calcular comisiones del período nuevo.
- **Cuentas:** Las cuentas vivas y vírgenes previas se conservan como cantidades
  y lotes de migración. Las cuentas cerradas anteriores son sólo una referencia
  estadística y no se recrean en el inventario operativo.
- **Trazabilidad:** El pantallazo confirmado es inmutable, pertenece al usuario
  y período, y genera un evento de auditoría con todos los valores declarados.
- **Visualización:** Inicio, Cuentas, Operaciones y Contabilidad consumen la
  misma apertura; la diferencia de conciliación permanece visible y nunca se
  convierte automáticamente en aporte o ganancia.
- **Estado:** Aprobada por Producto e implementada el 2026-09-21.

### APP-101 - Varias cuentas broker con nombre visible y saldo consolidado

- **Detección:** Todas las cuentas broker conectadas y no aisladas conservan su
  saldo individual; el saldo broker operativo y contable continúa siendo la
  suma determinista de esas cuentas.
- **Identificación:** El usuario puede asignar un nombre visible a cada cuenta
  cuando existen dos o más. La conexión y el número originales permanecen
  visibles y siguen siendo la identidad técnica utilizada por el conector.
- **Contabilidad:** Renombrar una cuenta no crea movimientos, subcuentas
  contables ni coberturas. Tampoco modifica conciliaciones existentes.
- **Trazabilidad:** Los nombres quedan persistidos por usuario y cuenta técnica,
  con actualización auditada. Sobreviven a una nueva vinculación del conector
  siempre que Ninja informe la misma conexión y número de cuenta.
- **Estado:** Implementada el 2026-09-22 antes de la prueba remota.

### APP-102 - Conectores por identidad y atribución analítica

- **Jerarquía:** Cada usuario NODAL conserva un conector principal y puede
  vincular un conector independiente por identidad aprobada. Todos pertenecen
  al mismo titular, pero cada instalación posee credenciales revocables y un
  identificador técnico propio.
- **Vinculación:** El código temporal se genera desde la ficha de la identidad.
  Canjearlo reemplaza solamente el conector de ese mismo ámbito; nunca revoca
  el conector principal ni los conectores de otras identidades.
- **Atribución:** Una cuenta prop incorporada desde el conector de una identidad
  queda asignada automáticamente a esa identidad. La asignación manual se
  conserva como corrección auditable y no como camino principal.
- **Contabilidad:** Identidad es una dimensión analítica. Compras, coberturas,
  resultados, fees y payouts se registran una sola vez en la contabilidad del
  usuario NODAL. El panel de Identidades filtra esos mismos hechos y no mantiene
  un libro paralelo.
- **Coberturas simultáneas:** Cada operación activa utiliza una única subcuenta
  broker. Una subcuenta nunca participa en dos operaciones simultáneas; por lo
  tanto, la capacidad concurrente máxima es la cantidad de subcuentas broker
  disponibles.
- **Saldo broker:** Si la misma cuenta broker es observada por más de un
  conector, se toma la observación más reciente y se cuenta una sola vez.
- **Interfaz:** La ficha de cada identidad muestra su conexión NinjaTrader,
  resultado, payouts y un historial resumido y desplegable de sus cuentas.
- **Estado:** Aprobada por Producto e implementada para pruebas el 2026-09-23.

### APP-103 - Un solo monitor de conexión para el espacio del usuario

- **Problema corregido:** Los paneles de cada identidad no deben iniciar su
  propio monitor global. Comparar el conector principal con el estado local de
  una identidad provocaba recargas completas cada cinco segundos.
- **Regla:** El espacio cargado mantiene un único monitor global. La pantalla de
  vinculación conserva un monitor propio solamente mientras el espacio todavía
  está bloqueado y espera la primera señal.
- **Alcance del estado:** Los indicadores globales `linked` y `online`
  corresponden exclusivamente al conector principal. Los conectores de
  identidades siguen formando parte del inventario y la atribución, pero no
  pueden hacer aparecer al conector principal como conectado.
- **Estado:** Implementada el 2026-09-24 tras la prueba remota de Alfred.

### APP-104 - Edición explícita de nombres de cuentas broker

- **Lectura:** Un nombre broker ya guardado se presenta como texto, sin campo
  de edición abierto, y ofrece la acción `Editar`.
- **Edición:** `Editar` vuelve a mostrar el campo con el nombre vigente y cambia
  la acción a `Guardar`. Un guardado exitoso regresa inmediatamente al modo de
  lectura mientras la página actualiza el dato persistido.
- **Alta inicial:** Las cuentas todavía sin nombre permanecen directamente en
  modo de edición para evitar un paso adicional.
- **Estado:** Implementada el 2026-09-24 durante la prueba de Alfred.

### APP-105 - Instalación del conector para una identidad sin acceso NODAL

- **Acceso:** La identidad no inicia sesión en Google ni recibe autorización
  para entrar a NODAL. El envío parte de su ficha ya aprobada y usa el correo
  que la propia persona declaró durante el onboarding.
- **Entrega:** `Enviar instalación` crea un enlace individual que vence a las
  24 horas. La descarga se sirve desde una ruta controlada; el ZIP deja de
  estar expuesto mediante una dirección pública fija.
- **Vinculación:** Descargar el instalador y generar el código son pasos
  separados. Después del envío, el usuario NODAL genera el código temporal de
  cinco minutos y lo comunica a quien instala el conector.
- **Alcance:** El correo no incluye credenciales, contraseñas ni acceso a la
  app. La instalación y la primera descarga quedan auditadas por identidad.
- **Revocación:** Un nuevo envío reemplaza cualquier enlace temporal anterior
  de esa identidad sin afectar su conector ya vinculado ni otros conectores.
- **Estado:** Implementada para pruebas el 2026-09-24.

### APP-106 - Conexión Ninja visible en cada cuenta registrada

- **Identificación:** La ficha de una cuenta registrada conserva como nombre
  principal la empresa y el identificador prop. Debajo muestra, en menor
  jerarquía, el nombre de la conexión configurada en NinjaTrader.
- **Persistencia:** El rótulo proviene de `ninja_account_links`; no se copia a
  la cuenta ni crea un nuevo dato editable. También permanece visible cuando
  la cuenta cierra, usando su último vínculo conocido.
- **Contabilidad:** Mostrar la conexión es sólo trazabilidad operativa. No
  cambia la empresa, la identidad atribuida, los resultados ni los asientos.
- **Estado:** Implementada el 2026-09-24 durante la prueba de Alfred y Lupe.

### APP-107 - Eliminación controlada de registros de cuentas

- **Alcance:** El titular puede eliminar desde la ficha una cuenta virgen o
  cerrada que haya registrado por error, tanto si fue cargada manualmente como
  si fue detectada por NinjaTrader.
- **Protección contable:** La base rechaza la eliminación cuando la cuenta ya
  tiene operaciones, coberturas, saldos manuales, retiros de fase o payouts. La
  interfaz no es la autoridad final de esta validación.
- **Trazabilidad:** Antes de eliminar se conserva en auditoría la cuenta, su
  compra, sus vínculos Ninja y cualquier atribución de identidad. La compra se
  revierte como parte de la corrección del alta errónea.
- **Redetección:** Los identificadores técnicos de una cuenta detectada borrada
  quedan excluidos por usuario, conector y conexión, evitando que un inventario
  histórico la vuelva a ofrecer automáticamente como cuenta nueva.
- **Estado:** Implementada para pruebas el 2026-09-24 a pedido de Alfred.

### APP-108 - Una cobertura física aunque el broker aparezca en varios conectores

- **Identidad económica:** Para un mismo titular, dos sesiones cerradas con el
  mismo número de cuenta broker, apertura, instrumento, dirección, cantidad y
  resultado representan una sola cobertura aunque lleguen desde el conector
  principal y desde el conector de una identidad.
- **Selección:** Se conserva la observación del conector que contiene el mayor
  contexto de cuentas prop opuestas y contemporáneas. Un lote ya contabilizado
  siempre tiene prioridad y nunca se reemplaza silenciosamente.
- **Trazabilidad:** La telemetría duplicada no se borra. Se marca como excluida,
  se retira únicamente su lote técnico pendiente y se registra la consolidación
  en auditoría.
- **Instrumentos:** La confirmación operativa del 28/09/2026 autoriza la
  equivalencia exclusiva `NQ` (prop) ↔ `MNQ` (broker) para conciliación
  automática, siempre que la apertura ocurra dentro de una ventana de diez
  segundos, tengan sentido opuesto y coincida el vencimiento.
  No se infieren equivalencias para otros pares de instrumentos.
- **Estado:** Implementada el 2026-09-24 tras detectar la doble observación de
  la cuenta broker 2018194 en la prueba de Alfred y Lupe.

### APP-109 - Aviso automático de identidades pendientes de aprobación

- **Detección:** El monitor liviano ya activo en la aplicación incluye una
  revisión determinista de las solicitudes de identidad en estado `submitted`.
- **Actualización:** Si una persona completa el formulario mientras el usuario
  NODAL tiene la app abierta, la vista se recarga una sola vez conservando la
  pestaña activa.
- **Aviso:** La navegación muestra un contador junto a `Identidades` hasta que
  las solicitudes recibidas sean aceptadas o rechazadas.
- **Estado:** Implementada el 2026-09-24 después de confirmar que la respuesta
  de Roberto llegó correctamente pero la pantalla de Alfred no se actualizó.

### APP-110 - Corrección de compras antes de la primera operación

- **Edición:** Una cuenta sin actividad puede corregir el costo, el origen de
  fondos y, cuando corresponda, la billetera debitada.
- **Contabilidad:** El cambio se aplica sobre la compra original; por lo tanto,
  capital aportado y saldo de billetera se recalculan sin crear movimientos
  compensatorios artificiales. Se valida saldo suficiente y se auditan los
  valores anterior y nuevo.
- **Bloqueo:** La edición y la eliminación se bloquean si existe cualquier
  operación, cobertura, saldo manual o payout, incluso si la operación técnica
  todavía no fue conciliada.
- **Eliminación:** Antes de borrar se exige confirmación visual y se advierte
  que el conector no volverá a ofrecer esa cuenta para registrar.
- **Estado:** Implementada para pruebas el 2026-09-24.

### APP-111 - Transferencias internas entre billeteras

- **Registro:** Se carga en un solo paso con billetera de origen, billetera de
  destino, importe enviado, fee real, fecha y observación opcional.
- **Saldos:** Debita el importe informado del origen y acredita `importe - fee`
  en el destino.
- **Contabilidad:** No es aporte externo ni retiro personal y no modifica el
  capital neto. Sólo el fee reduce el saldo total y el resultado del período.
- **Integridad:** Origen y destino deben ser billeteras activas distintas del
  mismo workspace; se valida saldo y se guarda atómicamente con auditoría.
- **Estado:** Implementada para pruebas el 2026-09-24.

### APP-112 - Alta directa de identidades

- **Registro:** El usuario NODAL agrega una identidad desde su panel ingresando
  únicamente nombre completo y correo. La identidad queda disponible de
  inmediato, sin invitación, formulario externo ni aprobación posterior.
- **Continuidad operativa:** Desde la identidad creada se conservan el envío e
  instalación del conector, su atribución automática de cuentas, resultados,
  payouts e historial resumido.
- **Estado inicial:** El alta queda aprobada para operar y mantiene la
  documentación y las credenciales operativas como pendientes. NODAL no
  solicita ni almacena contraseñas.
- **Migración:** Las identidades y solicitudes históricas permanecen intactas
  en la base. El flujo anterior se retira de la interfaz, sin borrar ni
  modificar datos ya cargados.
- **Trazabilidad:** Cada alta directa registra usuario, workspace, fecha,
  nombre y correo en auditoría.
- **Estado:** Implementada para pruebas el 2026-09-24.

### APP-113 - La detección inicial del broker no bloquea la reconstrucción

- **Dato provisional:** El primer saldo broker que el conector registra como
  aporte automático es una referencia técnica previa a la elección entre
  comenzar de cero o reconstruir una situación existente.
- **Apertura:** Ese único registro no oculta la configuración inicial. Al
  confirmar el punto de partida se reemplaza atómicamente por la apertura y se
  evita duplicar saldo broker o capital aportado.
- **Bloqueo real:** Cualquier cuenta registrada, trade, movimiento de billetera,
  payout u otro control diario continúa impidiendo una reconstrucción tardía.
- **Continuidad:** Una apertura ya confirmada impide que futuras variaciones del
  broker vuelvan a clasificarse como aporte inicial.
- **Trazabilidad:** El reemplazo queda consignado en la auditoría de la apertura.
- **Estado:** Implementada para pruebas el 2026-09-24 tras la reconexión de
  Julián.

### APP-114 - Simuladores y re-registro de cuentas quemadas

- **Simuladores:** Los nombres técnicos `Sim` seguidos por números y el nombre
  observado `Simbroker` se clasifican como simulación aunque la conexión tenga
  otro nombre. No integran saldo broker, compras ni cobertura.
- **Quema visible:** Una cuenta cerrada por quema que todavía aparece en el
  inventario de Ninja permanece reconocida como la misma vida ya registrada y
  no vuelve a ofrecerse como compra.
- **Reset real:** El mismo nombre externo sólo puede volver a registrarse cuando
  el motor haya observado primero su desaparición y luego un evento `reset` o
  `reset_after_burn` verificable. Una vez registrada la nueva vida, vuelve a
  quedar bloqueada contra duplicados.
- **Estado:** Implementada para pruebas el 2026-09-28 a partir del caso real de
  Mauricio con cinco cuentas Lucid, una broker y dos cuentas SIM visibles en
  NinjaTrader.

### APP-115 - Una ejecución explícita de cierre no inicia una operación técnica

- **Cierre:** `Sell` y `BuyToCover` sólo cierran posiciones; si llegan después
  del evento plano y fuera de la ventana reconstruida, no pueden abrir otra
  operación.
- **Reproceso:** Se retiran las sesiones abiertas artificiales que sólo
  contenían esos eventos tardíos.
- **Compatibilidad:** Las acciones de apertura (`Buy` y `SellShort`) y las
  ejecuciones antiguas sin acción declarada conservan el comportamiento previo.
- **Estado:** Implementada para pruebas el 2026-09-28 a partir de los eventos
  tardíos observados durante la operación de Mauricio.

### APP-116 - Coberturas por subcuenta y señal operativa vigente

- **Saldo broker:** Cuando un usuario mantiene más de una subcuenta broker, los
  saldos inicial y final validan el resultado de esa subcuenta, pero dicho
  resultado se aplica una sola vez sobre el saldo broker total.
- **Asignación:** Una segunda cobertura accidental puede conservar las cuentas
  prop reales que participaron. No se crea una cuenta ficticia, no se duplica
  la compra y no se altera el conteo de cuentas.
- **Trazabilidad:** El control diario identifica que el movimiento provino de
  una subcuenta y conserva sus saldos técnicos en la auditoría.
- **Señal:** Una sesión abierta sólo se muestra como operación activa mientras
  su conector continúe enviando señal. Si la señal se interrumpe, el registro
  técnico se conserva para una eventual recuperación, pero no sigue sumando
  horas ni aparece como una posición vigente.
- **Duplicados entre conectores:** La misma cobertura física puede ser
  observada desde varios Ninja. Se consolida cuando coinciden subcuenta,
  instrumento, dirección, cantidad y resultado, admitiendo hasta quince
  segundos de diferencia entre las aperturas informadas.
- **Estado:** Implementada para pruebas el 2026-09-28 a partir del caso de
  Alfred con dos subcuentas broker sobre una misma operación prop.

### APP-117 - Fallas de lectura separadas del estado de acceso y vinculación

- **Fecha:** 2026-09-29.
- **Hallazgo confirmado:** La página descartaba los errores al leer `nodal_users`
  y el estado del conector; una lectura fallida podía mostrar acceso pendiente
  o vinculación inicial aunque los registros siguieran activos.
- **Evidencia:** Mauricio y Alfred conservaban autorización y conectores
  principales activos. La causa exacta de las respuestas fallidas originales
  no quedó capturada; no se atribuye como hecho al incidente general de JWT.
- **Implementación:** Comprobar el error antes de interpretar los datos, realizar
  hasta tres intentos de lecturas transitorias y ofrecer recuperación explícita.
  Los reintentos no se aplican a escrituras económicas. El monitor responde 503
  ante lecturas fallidas sin publicar un estado falso de desvinculación.
- **Diagnóstico:** Registrar alcance y código del error sin secretos ni datos
  personales. La ruta de salud incluye la revisión del despliegue.
- **Validación:** Pruebas de recuperación de JWT/red, agotamiento de reintentos,
  permisos denegados y ausencia real de conector; typecheck, lint y build.

### APP-118 - Credenciales recuperables y continuidad al revincular Ninja

- **Fecha:** 2026-09-29. Corrección técnica; no modifica reglas contables.
- **Hallazgos comprobados:** el cliente 0.4 ejecutaba `ClearAuthorization`
  ante cualquier renovación fallida; el servidor convertía errores de base en
  401; una nueva vinculación creaba otro conector y dejaba el historial bajo el
  anterior. No se confirmó la causa del primer fallo remoto del 28/09.
- **Servidor:** distingue fallas de infraestructura (503, reintento) de una
  credencial efectivamente rechazada (401). Un inventario no persistido no se
  confirma como recibido. La telemetría no degrada la versión a 0.4.
- **Renovación recuperable:** conserva el secreto de renovación durante su
  vigencia original de 90 días, sin extenderla. Sólo rota el acceso corto; la
  repetición después de perder una respuesta sigue siendo posible. Vincular
  explícitamente rota ambos secretos y revocar impide usarlos. Los secretos
  siguen cifrados con DPAPI localmente y sólo sus hashes se guardan en servidor.
- **Cliente 0.5:** nunca borra automáticamente las credenciales por un fallo;
  diferencia renovación pendiente y rechazo confirmado. Guarda configuración
  mediante reemplazo atómico con respaldo. `ACTUALIZAR-NODAL.cmd` actualiza
  sólo el código, conservando configuración y cola, y exige compilar en Ninja.
- **Identificación estable:** `redeem_ninja_pairing_code` reutiliza el conector
  activo o el último revocado exclusivamente del mismo titular e identidad.
  Serializa por titular, revalida aprobación de identidad y conserva enlaces,
  vidas, cierres, exclusiones, snapshots y operaciones. Rota las credenciales
  sin reactivar las anteriores ni conceder nuevos permisos a clientes web.
- **Reparación del incidente:** el archivo acotado en
  `supabase/repairs/20260929_connector_continuity.sql` consolidó el historial
  anterior bajo el conector vigente de Mauricio. Recuperó ocho vínculos de
  siete cuentas; conservó los IDs de sesiones/lotes, snapshots y telemetría.
  Los eventos técnicos duplicados no se borran. Respalda los estados anterior
  y nuevo y los IDs movidos en `audit_events`. No modifica compras, importes,
  controles ni entradas contables. Las reglas normales vuelven a procesar los
  datos recibidos una vez recuperado el contexto.
- **Validación remota:** ensayo completo con `BEGIN/ROLLBACK` y luego aplicación
  transaccional. Confirmados siete registros distintos, ocho vínculos, cero
  cuentas Lucid visibles sin correspondencia y un evento de auditoría. La
  migración `20260929160000` quedó registrada en el historial de Supabase.
- **Pruebas:** renovación repetida, vencimiento original conservado, fallas de
  red/base, rechazo auténtico, inventario no guardado; regresión SQL de tres
  revinculaciones activas/revocadas, aislamiento, preservación de vínculos y
  rechazo de secretos anteriores/códigos consumidos. C# 0.5 compilado contra las
  librerías instaladas de NinjaTrader 8, además de tests TypeScript y build web.
- **Despliegue del cliente:** la web no actualiza automáticamente el AddOn de
  otras PCs. En la PC local se copió 0.5 y se verificó que el hash de la
  configuración no cambiara; la activación requiere compilar en NinjaTrader.
  Ivo, Julián, Alfred y cada identidad deben actualizar su instalación con el
  ZIP nuevo, sin generar códigos ni resetear su cuenta.

### APP-119 - Primera vuelta y confirmación de trades broker sin cobertura

- **Fecha:** 2026-09-29. Solicitud expresa de Mauricio tras identificar el
  resultado USD 11,60 como trade broker independiente y el siguiente USD 510,60
  como cobertura de la primera operación funded de su cuenta 1.
- **Etapa:** una transición confirmada evaluación → funded del mismo registro
  determina Primera vuelta, aunque la última entrada sea de evaluación. Se
  consulta la etapa a la fecha de apertura; no se reetiquetan trades anteriores
  ni se usa una etapa futura. Una funded importada sin historia confirmada
  conserva la revisión, porque no demuestra por sí sola qué vuelta atraviesa.
- **Confirmación explícita:** un lote sin prop puede ofrecer “Registrar sin
  cobertura”, incluso sin cuentas abiertas. El servidor exige titular activo,
  cierre estable, importe vigente, ausencia de prop/asignaciones y continuidad
  contable. No crea cuentas ficticias ni aportes. Guarda fuente, fecha, período,
  sesión, confirmación y auditoría; cero participantes y cero entradas prop.
- **Contabilidad:** el resultado independiente integra el saldo y resultado
  general. Se separa explícitamente en la conciliación de ganancias de cuentas;
  no altera capital, identidades, payouts ni la base vigente de comisión sobre
  cuentas cerradas. No se redefine la política comercial de comisiones.
- **Integridad:** confirmación idempotente y bloqueo por sesión/subcuenta/período;
  el reproceso no puede sobrescribir lotes confirmados ni sus participantes.
  Los duplicados observados por otros conectores se rechazan. Un movimiento
  anterior a registros ya asentados requiere corrección histórica controlada.
- **Correcciones:** corregir un saldo anterior conserva el resultado confirmado
  del trade independiente; no lo redistribuye entre props. Cambiar ese resultado
  técnico no se ofrece en el editor general de saldos.
- **Validación remota:** migración y regresión de las dos operaciones de Mauricio
  probadas en una transacción revertida. Se verificó el registro idempotente de
  USD 11,60 sin participantes prop, el saldo posterior y la cobertura funded de
  USD 510,60 con saldo final USD 5.355,02. Migración `20260929190000` aplicada
  y registrada en Supabase. Ambas operaciones reales permanecen pendientes
  hasta que Mauricio confirme la primera en la app.
- **Sin cambios de conector:** no requiere reinstalar ni revincular NinjaTrader.

### APP-120 - Continuidad de Alfred y observaciones broker demoradas

- **Fecha:** 2026-09-30. Corrección de datos y endurecimiento técnico; no cambia
  reglas contables ni operativas.
- **Hallazgo confirmado:** la revinculación anterior a APP-118 creó conectores
  distintos para el mismo titular e identidad. Los vínculos, exclusiones y el
  historial quedaron repartidos entre conectores revocados y activos. En Nati,
  cinco cuentas externas ya registradas se volvieron a crear como cuentas
  económicas nuevas, duplicando compras y referencias.
- **Operaciones del 29/09:** se preservan dos conciliaciones independientes de
  `-US$ 545,74`: Nati con la subcuenta `2018194` y Lupe con la subcuenta
  `1584435`. La conciliación de Roberto por `-US$ 175,04` fue creada una sola
  vez; antes de la confirmación manual no existía un control para ese cierre.
- **Falso pendiente:** la cobertura `1584435` también fue observada desde el
  Ninja de Nati con 6,56 segundos de demora. No tenía control contable ni
  cuentas prop asignadas. Se la excluye como segunda observación de la
  conciliación de Lupe, conservando el registro técnico y la auditoría.
- **Prevención:** la deduplicación entre conectores conserva la coincidencia
  exacta de subcuenta, instrumento, dirección, cantidad y resultado, y amplía
  la tolerancia temporal de cinco a quince segundos. La migración
  `20260930120000` quedó aplicada en Supabase y verificada en las tres rutas de
  comparación de la función activa. `20260930121000` aplica la misma ventana a
  la confirmación manual para impedir registrar el espejo como trade sin
  cobertura.
- **Reparación:** `supabase/repairs/20260930_alfred_connector_continuity.sql`
  reúne historial y vínculos bajo los conectores activos, fusiona la actividad
  de las cinco copias de Nati con las cuentas originales y conserva las compras
  originales del 28/09. Registra el estado previo completo en `audit_events`.
- **Seguridad:** el script exige titular, identidad y estados exactos, bloquea
  si cambiaron los conectores o aparecieron referencias inesperadas, y valida
  al final 25 cuentas reales, 25 vínculos recuperados y los controles 19, 20 y
  21 sin alterar sus importes.

### APP-121 - Carga privada acotada y recuperación visible

- **Fecha:** 2026-09-30. Corrección de disponibilidad; no modifica datos,
  conciliaciones, permisos ni vínculos de NinjaTrader.
- **Hallazgo:** `/app` esperaba varias rondas de lecturas antes de renderizar.
  Una consulta remota que no terminaba dejaba al navegador en carga indefinida,
  sin distinguir ese caso de una cuenta deshabilitada.
- **Decisión:** la carga completa dispone de veinte segundos. Si no concluye,
  muestra una recuperación explícita que permite reintentar y aclara que los
  registros y vínculos se conservan. Los fallos de render tienen su propio
  límite visual y no dejan una pantalla vacía.
- **Alcance:** no se inventan resultados parciales ni se reemplazan errores por
  colecciones vacías. El límite sólo decide qué interfaz ve el usuario; las
  escrituras económicas continúan fuera de los reintentos automáticos.
- **Validación:** prueba determinista del resultado normal y del vencimiento,
  además de typecheck, lint, suite completa y build de producción.
