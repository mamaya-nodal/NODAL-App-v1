# Decisiones tecnicas de NODAL App

### APP-169 - Confirmación de titularidad broker accesible durante la apertura

- **Fecha:** 2026-10-08.
- **Causa verificada:** el servidor recibió las dos cuentas Live y sus saldos,
  pero APP-123 las retuvo en `ninja_unclaimed_broker_accounts` al no tener
  titularidad. La apertura sólo consultaba el inventario ya filtrado y mostraba
  erróneamente que faltaba conectar Ninja. El botón `Es mía` estaba detrás del
  modal en Cuentas, produciendo un bloqueo circular para los usuarios nuevos.
- **Corrección:** el asistente ofrece la misma confirmación auditada de APP-123
  en Dinero disponible / Dinero actual y Vista previa. Actualiza señal y saldo
  sin perder el borrador. No requiere reemplazar el conector ni asigna cuentas
  automáticamente.
- **Disponibilidad inmediata:** después de confirmar, la app puede leer la
  última muestra balance real conservada en `ninja_event_receipts`, con su fecha
  original, mientras el inventario filtrado aún sea anterior a la confirmación.
  La consulta privilegiada se limita a titularidades del usuario autenticado,
  destinos personales activos y conexiones no aisladas. El próximo inventario
  posterior a la confirmación toma precedencia, incluso vacío o desconectado.
- **Orden de observaciones:** los reintentos de telemetría antigua sobrescribían
  fecha y saldo de la bandeja pendiente. La ingesta ahora inserta sin reemplazar
  filas existentes y avanza la última observación mediante una condición atómica
  por fecha. La lectura recupera la muestra más reciente del ledger para los
  pendientes existentes que sufrieron ese retroceso.
- **Límite del diagnóstico anterior:** APP-168 describió una mejora en la captura
  del conector, pero atribuyó indebidamente al envío las listas vacías persistidas:
  dichas listas ya estaban filtradas por el servidor. No demostraban una lectura
  local vacía. La causa del bloqueo de alta se verifica en APP-169.

### APP-168 - Envío de la captura de inventario sin segunda lectura asíncrona

- **Fecha:** 2026-10-08.
- **Evidencia:** el diagnóstico local de Ivo observó de forma repetida las
  cuentas broker `1850465` y `2210006` tanto en `Account.All` como en
  `Connection.Accounts`, con conexión `Live`, proveedor `Provider31`, estado
  conectado, saldos legibles y resultado positivo del filtro 0.14. En esos
  mismos segundos, el conector 0.14 persistió inventarios vacíos en producción.
- **Hallazgo:** `RefreshInventory` obtenía la colección correcta, pero la cola
  no conservaba esa captura. Después de 750 ms, `SendInventoryAsync` volvía a
  consultar NinjaTrader desde la tarea de red y construía el payload con esa
  segunda vista, que podía estar vacía según el contexto del proveedor.
- **Decisión:** 0.15 serializa huella, payload y cantidad en el mismo refresco
  que descubrió las cuentas. La cola conserva la captura más reciente, evita
  lecturas concurrentes del conjunto de suscripciones y envía exactamente el
  inventario observado sin volver a consultar la API local.
- **Integridad:** no se relajan filtros, no se inventan cuentas o saldos y no se
  reutilizan inventarios históricos. Los reintentos normales continúan mediante
  el heartbeat, que genera una captura nueva cada quince segundos.

### APP-167 - Inventario Ninja combinado para proveedores con vistas incompletas

- **Fecha:** 2026-10-07.
- **Hallazgo:** el conector 0.13 estaba activo y transmitía, pero en un caso real
  `Account.All` sólo expuso tres cuentas simuladas aunque el broker figuraba
  conectado en NinjaTrader. La app no tenía una cuenta broker que clasificar.
- **Decisión:** publicar 0.14 combinando las cuentas activas de `Account.All` y
  de cada `Connection.Accounts`, y deduplicarlas por conexión y nombre. Se
  conservan el filtro de conexión activa, el modo de sólo lectura y toda la
  trazabilidad existente.

### APP-166 - Reinstalación no bloqueada por una sesión Ninja revocada

- **Fecha:** 2026-10-07.
- **Hallazgo:** 0.12 conservaba la credencial anterior al ejecutar una
  instalación nueva. Si esa credencial había sido revocada, intentaba renovarla
  antes de canjear el código nuevo y repetía el rechazo indefinidamente.
- **Decisión:** publicar 0.13. `INSTALAR-NODAL` elimina sólo la sesión técnica
  anterior; `ACTUALIZAR-NODAL` conserva la sesión para permitir vínculos
  adicionales. Como defensa, un rechazo definitivo seguido de un código nuevo
  descarta la sesión y continúa con el canje en el mismo ciclo.
- **Conservación:** no se borran cola, respaldos, eventos ni historial.

### APP-165 - La baja de acceso invalida el conector del ciclo anterior

- **Fecha:** 2026-10-07.
- **Hallazgo:** una baja cambiaba `nodal_users.access_state`, pero dejaba activo
  el conector Ninja. Si el usuario pedía reactivación y era aprobado otra vez,
  la aplicación reutilizaba esa credencial histórica y omitía la instalación.
- **Decisión:** toda transición a acceso revocado invalida conectores activos y
  vence códigos de vinculación pendientes. Una aprobación posterior conserva
  la cuenta y su historial, pero exige un vínculo nuevo antes de reconstruir.
- **Reparación:** revocar conectores activos cuya fecha de vinculación sea
  anterior o igual a la última baja auditada del usuario. No se eliminan
  inventarios, operaciones, cuentas ni registros contables.
- **Aplicación:** migración `20261007190000` ejecutada y registrada en
  producción. Resultado: disparador instalado, tres conectores históricos
  reparados y cero conectores obsoletos todavía activos.

### APP-164 - Publicación general del conector 0.12 con transición compatible

- **Fecha:** 2026-10-07.
- **Decisión:** publicar 0.12 como descarga oficial y habilitar la recepción v2
  para todos los conectores autenticados mediante un interruptor de producción
  separado. Mantener el protocolo anterior para instalaciones 0.11 durante la
  transición; la actualización no se impone ni reemplaza archivos remotamente.
- **Evidencia previa:** piloto de Mauricio con inventario de seis cuentas, doce
  confirmaciones `persisted:stored`, cuatro exclusiones de simulador y cero
  conflictos, cuarentenas o eventos pendientes. Suite completa, tipos y build
  correctos antes de la publicación.
- **Riesgo aceptado:** no habrá operativa real de Mauricio en los próximos días.
  Por autorización del titular se amplía el despliegue y se observará sobre la
  marcha; esto no convierte la conciliación de una operación real en validada.
- **Reversión:** desactivar `NINJA_TELEMETRY_V2_ALL_CONNECTORS` devuelve el
  alcance a la lista explícita sin borrar colas ni registros. Las instalaciones
  0.11 conservan el transporte anterior.

### APP-163 - Piloto 0.12 exclusivo de Mauricio

- **Fecha:** 2026-10-07. Mauricio aprobó verificar servidor por separado y
  actualizar sólo su instalación con respaldo, sin exigir otro equipo.
- Respaldo local verificado por hash de configuración, cola y fuente instalada,
  con ACL restringida, fuera del repositorio. Ningún secreto fue publicado.
- Antes de publicar se detectó y corrigió `nodal_users.status` por
  `nodal_users.access_state`; el ensayo SQL anterior usaba una tabla simplificada.
  La prueba ahora importa DDL real del repositorio y verifica usuario revocado.
- Migración `20261007000000` aplicada transaccionalmente y registrada desde el
  editor Supabase, debido a falla de transporte de CLI. No modifica registros
  económicos ni migra historiales; agrega recibos/trabajos y funciones privadas.
- Activación doble: flag y lista explícita de conectores. Tanto intake como
  disparador heartbeat v2 quedan limitados al piloto; no basta activar el flag.
  La instalación fue contrastada con el usuario activo
  `mauriciosebastianamaya@gmail.com`. El resto mantiene protocolo existente.
- Descarga oficial 0.11 intacta. La compilación/ejecución Ninja y conciliación
  posteriores a la actualización son requisito antes de ampliar el piloto.
- Servidor publicado con verificación HTTP de revisión, salud de base y rechazo
  401 de solicitudes no autenticadas a ambos protocolos. Fuente 0.12 copiada
  mediante UpdateOnly con Ninja cerrado; hash de cola y campos de vinculación
  conservados. No se compiló ni inició Ninja por el usuario.
- La comparación numérica de versiones evita ofrecer 0.11 como actualización
  a un piloto 0.12. Pruebas finales: 521/113 archivos, tipos y build correctos.
- **Activación comprobada:** Mauricio compiló y reinició Ninja. Supabase recibió
  `connector_version=0.12`, `installed_source_version=0.12`, conector activo y
  heartbeat posterior al inicio. La importación creó únicamente marcador/lock:
  cero pendientes y cero cuarentenas; recibos/trabajos permanecen vacíos porque
  todavía no se generó telemetría v2. El primer inventario informó cero cuentas
  al estar las conexiones Ninja desconectadas tras el reinicio. Falta reconectar
  y comprobar inventario real; no es necesario abrir una operación para ello.
- **Reconexión comprobada:** inventario real recibido con seis cuentas conectadas
  (broker principal y cinco cuentas Lucid). El protocolo v2 generó 12 recibos
  `persisted/stored` y cuatro `excluded/simulator`, sin pendientes ni conflictos.
  La cola local sólo conserva marcador y lock: cero eventos y cero cuarentenas.
  El trabajo durable alcanzó `revision=completed_revision=12`, sin lease ni error.
  Esto valida transporte, recibos y reconstrucción técnica inicial; no equivale
  por sí solo a una conciliación económica ni valida todavía una operación nueva.

### APP-162 - Transporte Ninja v2 y conector 0.12 candidato

- **Fecha:** 2026-10-07. Segunda etapa autorizada, implementada localmente.
  No instalada ni desplegada. ZIP oficial y versión publicada permanecen 0.11.
- **Contrato:** recibos durables por evento, vinculados a instalación, ID y hash;
  confirmación exclusivamente de persistencia técnica, no de asiento contable.
  Pendientes no se borran; conflictos quedan conservados para revisión. La
  exclusión explícita de simuladores mantiene la política de enrutamiento vigente.
- **Servidor:** migración aditiva con RLS y RPC sólo service_role; inserción
  transaccional de recibo/evento/trabajo. Reintentos idempotentes y trabajos con
  revisión/lease; oportunidad de ejecución mediante recepción y heartbeat.
  Endpoint separado y feature flag apagado por defecto. El protocolo viejo sigue.
- **Conector:** cola individual cifrada DPAPI, ACL por usuario/SYSTEM, importación
  no destructiva del formato anterior, sin truncamiento 8 MiB, cuarentena visible
  en salida Ninja, validación de recibos antes de retirar archivos. Destinos HTTPS
  oficiales sin redirects, JSON escapado y precios sin redondeo fijo. Instalador
  exige Ninja cerrado; configuración reemplazada atómicamente con respaldos.
- **Sin cambio económico:** se instrumentan errores HTTP de los motores para
  no dar por completado un intento que ocultó una falla de infraestructura; no
  se cambian fórmulas, titularidades ni ventanas de lectura. Persistir no prueba
  conciliación, especialmente para eventos tardíos y cuentas aún no vinculadas.
- **Publicación:** requiere ensayo integrado en base aislada y piloto Ninja,
  servidor primero y conector después. No se usan datos reales para estas pruebas.
  Límites, comandos, validación y reversión: `42_NINJA_V012_VALIDACION_Y_DESPLIEGUE.md`.

### APP-161 - Refuerzo compatible de recepción Ninja, primera etapa

- **Fecha:** 2026-10-07. Implementación local autorizada por Mauricio tras la
  revisión externa. No publicada ni aplicada sobre datos de Producción.
- **Alcance:** endurecer el transporte sin cambiar pantallas, selección
  automática de cuentas, semáforos, titularidades, reglas económicas ni
  credenciales de instalaciones existentes. No requiere actualizar el conector.
- **Entrada acotada:** inventario (128 KiB), telemetría (256 KiB), vinculación
  y vínculo adicional (4 KiB) aplican el límite mientras leen el cuerpo,
  también sin Content-Length o con un tamaño subdeclarado. Se valida el tipo
  JSON exacto y la codificación UTF-8. El heartbeat autentica antes de leer y
  limita su cuerpo a 4 KiB, conservando compatibilidad con latidos antiguos
  sin cuerpo/cabecera JSON. No es un sustituto de límites de frecuencia/WAF.
- **Minimización:** se construyen inventarios y eventos exclusivamente con los
  campos del contrato vigente antes de enrutarlos o persistirlos. Los campos
  adicionales no se almacenan. Los IDs de propietario/destino suministrados
  por el cliente no conceden autoridad; continúa decidiendo el servidor desde
  el conector autenticado. Se conservan las magnitudes y la precisión recibida.
- **Diagnóstico:** el resumen de inventario conserva sólo conteos. Ya no
  publica nombres de conexiones, IDs de evento, fechas ni resultados internos
  del procesamiento. El conector distribuido sólo consulta el estado HTTP
  para estas respuestas. No se borran registros técnicos/históricos existentes.
- **Errores:** excepciones de recepción/procesamiento responden 503 con
  Retry-After y no-store, sin imprimir el error original ni el payload.
  Las fallas de persistencia de cualquier destino continúan impidiendo
  confirmar el lote. Las fechas de inventario inválidas se rechazan antes de
  clasificación; una fecha inválida no puede hacer fallar el procesamiento.
- **Límite importante:** el protocolo legado confirma lotes, no cada evento.
  Esta etapa NO corrige aún la confirmación 2xx de un lote total/parcialmente
  omitido por enrutamiento, el descarte local al superar 8 MiB, la falta de
  recibos durables individuales ni todos los errores internos de los motores
  que éstos expresan como resultados en lugar de excepciones. Tampoco
  acceptedEvents equivale a cantidad de inserciones nuevas: conserva la
  semántica anterior. No se presenta este cambio como garantía de entrega.
- **Siguiente etapa:** diseñar recibos persistentes por evento y tratamiento
  explícito de pendientes/exclusiones, con reintentos idempotentes; publicar
  primero el servidor compatible y después un conector que retire únicamente
  eventos confirmados. No convertir todos los eventos omitidos en reintentos
  del lote legado: un broker sin titular o una recepción pausada podría
  bloquear los primeros 50 eventos y detener la cola entera. También quedan
  para el conector la conservación de la cola, el destino HTTPS autorizado,
  la escritura local segura y la serialización sin redondeo fijo de precios.
- **Verificación:** 498 pruebas en 109 archivos aprobadas, typecheck y build
  correctos; lint sin errores y con 10 advertencias en archivos no modificados.
  Regresiones de límites por bytes/chunks, UTF-8, compatibilidad, autenticación
  antes de lectura, campos extra, privacidad, errores y fallas parciales.
  Se usaron dobles de prueba, sin consultas/escrituras a la base real durante
  esas pruebas. No hay cambios C#, migraciones SQL ni cambios de permisos/RLS.
- **Publicación pendiente:** no hacer ensayos con escritura en Preview mientras
  siga compartiendo la base de Producción según APP-143. Validar el despliegue
  en un entorno separado antes de promoverlo. Esto mejora privacidad y
  confiabilidad; no demuestra la causa del incidente Tradeify ni oculta NODAL
  frente a herramientas antifraude.

### Recuperación segura del saldo broker previo (2026-10-05)

- Una sesión técnica excluida nunca se usa para establecer continuidad contable del saldo broker: su exclusión indica precisamente que no es una fuente confiable para el libro.
- El saldo esperado sólo procede del último control contable confirmado, del cierre del período anterior o de un evento agregado de saldo broker verificado.
- Si ninguna fuente confiable existe, la automatización se bloquea solicitando el depósito inicial en lugar de inferirlo desde un fragmento técnico.
- La primera operación Ninja de un período toma como saldo anterior el último control confirmado del período precedente y comienza la numeración del período nuevo en `1`. La misma regla se aplica a trades cubiertos y a trades broker sin cobertura confirmados por el usuario.

### Fecha operativa visible en el historial (2026-10-05)

- Cada conciliación del historial de Operaciones muestra fecha operativa y hora de apertura en Buenos Aires.
- Se prioriza `operated_on`, que representa el día contable del trade; si falta, se deriva la fecha desde `opened_at` con la zona horaria operativa.

### Espacio personal limitado al titular (2026-10-05)

- La consulta de espacios en `/app` filtra por el usuario autenticado, también para Admin Master. El permiso administrativo no selecciona implícitamente otro titular.
- Las vistas administrativas individuales conservan la selección explícita de usuario.
- Se corrige la lectura que mostraba cuentas de Alfred bajo el perfil de Mauricio. No se modifican registros económicos ni se trasladan cuentas.

### APP-151 - IDs reales y traslado guiado de estructuras

- **Fecha:** 2026-10-05. Implementación solicitada por Mauricio para completar
  los dos pendientes finales del panel Admin.
- **Persistencia de identidad:** cada unidad y mesa posee un código persistido.
  Los usuarios reciben un ID visible mediante un correlativo transaccional por
  mesa. El UUID de autenticación y todos los registros económicos permanecen
  inmutables.
- **Historial:** un cambio de mesa cierra el ID vigente y crea el siguiente del
  destino; no actualiza ni reutiliza el anterior. La migración inicial asigna
  IDs a la estructura vigente sin inventar traslados históricos que el sistema
  anterior no registró.
- **Movimiento de administradores:** trasladar a un administrador cambia su
  pertenencia y mueve su mesa administrada completa bajo el nuevo destino. Los
  integrantes y submesas conservan sus relaciones internas e IDs porque ellos
  no cambian de mesa.
- **Baja o degradación:** si el administrador tiene dependencias, la interfaz
  exige una mesa de destino. Usuarios y submesas se reasignan dentro de una
  única transacción antes de desactivar su mesa. No puede formarse un ciclo ni
  quedar una dependencia huérfana.
- **Seguridad y trazabilidad:** la base valida rama administrada, estado de los
  destinos, ciclos y ventana de porcentajes. Cada ID y movimiento estructural
  registra actor, fecha, motivo y estado anterior/posterior.

### APP-150 - Flujos reales y alcance del panel Admin

- **Fecha:** 2026-10-04. Implementación solicitada tras aprobar el diseño del
  panel Admin.
- **Invitaciones:** el administrador de mesa registra el correo, la persona que
  refiere y la mesa de destino. El correo se envía mediante la automatización
  del servidor y el pedido queda pendiente hasta que Admin Master lo aprueba.
  La aprobación prepara los espacios Real y Práctica, crea el acuerdo inicial y
  conserva actor, fechas, estados y motivo.
- **Despacho seguro:** la automatización externa recibe únicamente el ID de la
  invitación y un token efímero. El destinatario y el referente se resuelven en
  el servidor después de validar ese token; no se acepta una dirección elegida
  por el webhook. El mismo token confirma el envío y habilita el estado
  pendiente de aprobación.
- **Permisos:** el rol Admin de mesa no reutiliza el rol técnico Admin Master.
  La autorización se resuelve en base de datos sobre la rama administrada; no
  se aceptan mutaciones sobre usuarios o mesas ajenos a esa rama.
- **Persistencia:** rol, estado, email de contacto, habilitación de identidades,
  porcentajes y adjudicaciones se guardan en servidor y generan historial. Los
  porcentajes respetan la ventana de 48 horas de APP-148; Admin Master mantiene
  su excepción auditada.
- **Bajas y degradaciones:** no se puede degradar ni dar de baja a un
  administrador mientras conserve integrantes o mesas dependientes. Los
  subordinados deben reasignarse primero y ningún registro histórico se borra.
- **Ficha real:** mejor trade y ruta de mayor ganancia se leen de lotes Ninja
  comprometidos. El detalle económico de identidades se reconstruye desde las
  cuentas explícitamente asignadas y las mismas reglas deterministas de fases
  usadas por Contabilidad.
- **Correos:** `nodal_users.email` es el correo de acceso sincronizado con
  Google y permanece en solo lectura. `contact_email` es el correo operativo
  editable. Cambiar el segundo nunca cambia silenciosamente la autenticación.

### APP-149 - Unidades del Sistema NODAL e identificadores visibles

- **Fecha:** 2026-10-04. Regla funcional confirmada por Mauricio.
- **Jerarquía general:** `SISTEMA NODAL` contiene unidades empresariales. La
  primera es `01 - Unidad NODAL`; futuras empresas incorporadas crean nuevas
  unidades, por ejemplo `02 - Unidad Highway`. Cada unidad posee una única
  Mesa Principal y puede generar mesas dependientes.
- **Código de unidad:** cada unidad recibe una abreviatura única de dos letras
  mayúsculas, por ejemplo `ND` para NODAL y `HW` para Highway. Admin Master la
  define al crear la unidad.
- **Código de mesa:** la Mesa Principal utiliza `MP`. Las mesas dependientes
  reciben correlativos dentro de su unidad al crearse: `M01`, `M02`, `M03`,
  etcétera.
- **ID visible de usuario:** sigue el formato exacto, sin espacios,
  `USER<UNIDAD>-<MESA>-<ORDEN>`. Ejemplos: `USERND-MP-03` y
  `USERHW-M03-01`. El último tramo es el orden correlativo de ingreso en esa
  mesa.
- **Administradores:** convertirse en administrador no traslada al usuario ni
  cambia su ID. Un usuario `USERND-MP-04` puede administrar `M01`; los nuevos
  integrantes de esa mesa reciben `USERND-M01-01`, `USERND-M01-02`, etcétera.
- **Traslados:** al cambiar de mesa, el usuario recibe el siguiente ID visible
  disponible del destino. El ID anterior queda preservado en su historial; el
  UUID técnico inmutable y todos sus registros se conservan.
- **Correlativos:** números de unidad, mesa y usuario nunca se reutilizan tras
  bajas, cierres o traslados. Siempre avanzan desde el último valor otorgado.

### APP-148 - Panel Admin, jerarquía y distribución económica por mesa

- **Fecha:** 2026-10-04. Definición funcional confirmada por Mauricio a partir
  del mockup de la pestaña `Admin`.
- **Alcance visual:** el resumen separa la mesa directa de la estructura total
  descendiente. La estructura total es el indicador principal e incluye toda la
  rama ubicada debajo del administrador; la mesa directa permanece visible como
  desglose.
- **Altas:** el administrador de mesa puede invitar a una persona, pero aceptar
  la invitación no activa el acceso por sí solo. Toda alta requiere aprobación
  de Admin Master.
- **Usuarios e identidades:** la aprobación de Admin Master corresponde
  exclusivamente a usuarios NODAL, es decir, personas con su propia cuenta, app
  y contabilidad. Las identidades no siguen ese circuito: cada usuario crea,
  administra y da de baja sus propias identidades desde su panel, porque forman
  parte de su organización contable personal.
- **Gestión delegada:** dentro de su rama autorizada, el administrador de mesa
  gestiona los porcentajes comerciales, roles, bajas lógicas y movimientos de
  usuarios o mesas previstos en el mockup. Esta decisión sustituye el límite de
  solo lectura de APP-089 y la reserva exclusiva a Master de los acuerdos
  descrita en APP-077. La implementación deberá mantener autorización de
  servidor por alcance, auditoría completa y protección contra modificar ramas
  ajenas.
- **Bajas e identidad técnica:** una baja desactiva el acceso y conserva todo el
  historial. Un traslado cambia la pertenencia y el código visible de mesa,
  pero nunca el identificador técnico inmutable del usuario ni sus registros.
- **Administradores con dependencias:** antes de bajar o degradar a un
  administrador, sus usuarios y mesas dependientes deben reasignarse o darse de
  baja de forma explícita. No se permiten dependencias huérfanas.
- **Asignaciones:** un administrador subordinado puede recibir múltiples
  integrantes; la selección no se limita a una sola persona.
- **Acuerdo de operativa propia:** el porcentaje personal del administrador se
  aplica al resultado bruto de sus cuentas cerradas, incluidas sus identidades,
  sin compensaciones, reinterpretaciones ni bases alternativas. Ejemplo
  confirmado: con USD 10.000 y acuerdo NODAL del 40%, la
  comisión NODAL es USD 4.000.
- **Ventanas de edición:** los porcentajes pueden definirse al crear el usuario
  NODAL y durante las 48 horas posteriores al cierre del período anterior. La
  apertura automática del período siguiente no cambia. Cumplidas las 48 horas,
  los porcentajes quedan en modo de solo lectura para administradores de mesa
  durante el resto del período. Admin Master conserva la facultad excepcional
  de modificarlos dentro del período; su interfaz se definirá con el futuro
  mockup de Admin Master. Los cierres anteriores permanecen inmutables.
- **Cierre único:** operativa propia y administración de estructura no son
  escenarios alternativos. En cada cierre de período se calculan juntas las
  comisiones de todas las personas y mesas alcanzadas. El resultado neto de un
  administrador integra su operativa propia neta y su participación neta por
  administración; la comisión total NODAL integra los importes correspondientes
  a ambos conceptos.
- **Acuerdo por administración:** cada usuario y cada mesa dependiente puede
  tener un porcentaje distinto en favor del administrador superior. La suma de
  esas participaciones forma el ingreso bruto por administración. Sobre ese
  ingreso se aplica después el acuerdo `Admin mesa` entre el administrador y
  NODAL. Ejemplo confirmado: una estructura factura USD 40.000; con reparto
  uniforme del 50%, USD 20.000 corresponden a los usuarios y USD 20.000 son
  participación bruta de Alfred. Con acuerdo `Admin mesa` del 25%, NODAL recibe
  USD 5.000 y Alfred conserva USD 15.000.
- **Ejemplo conjunto de cierre:** con los dos ejemplos anteriores en el mismo
  período, NODAL recibe USD 9.000, Alfred recibe USD 21.000 netos y los usuarios
  de la estructura reciben USD 20.000. Los USD 50.000 originales quedan
  distribuidos una sola vez.
- **Cascada confirmada:** el porcentaje de una mesa superior se aplica a la
  participación bruta obtenida por el administrador inmediatamente inferior,
  nunca nuevamente a la facturación original de toda la rama. Ejemplo: Javier
  factura USD 100; un reparto del 50% deja USD 50 para Javier y USD 50 de
  participación administrativa para Juana. Si Alfred tiene 50% sobre la mesa
  de Juana, recibe USD 25 de esos USD 50 y Juana conserva USD 25 antes de aplicar
  los acuerdos NODAL que correspondan a cada administrador.
- **Ranking:** se ordena por facturación del período anterior.
- **Ficha de usuario:** la tabla conserva ID visible, nombre, rol, estado y
  resultados resumidos. Seleccionar una persona abre una ventana superpuesta,
  no una página ni una fila expandida. La ficha reúne desempeño, mejor trade,
  última operación, ruta de mayor ganancia, estado, email, rol, adjudicaciones
  múltiples, acuerdos, conector Ninja e identidades. Una baja exige
  confirmación antes de guardarse. En esta interfaz los roles visibles son
  `Usuario` y `Admin`; `Alumno` no se utiliza como nombre de rol.
- **Conector Ninja en la ficha:** es un dato observado y no un ajuste manual.
  Se muestra la versión informada, la última transmisión y el estado `Activo`
  únicamente cuando hubo señal durante las últimas 24 horas. Sin señal dentro
  de ese rango se muestra `Desactivado`; el administrador no puede cambiarlo.
- **Invitaciones:** `Agregar usuario` despliega email, persona que invita y el
  estado de cada invitación o aprobación. La persona que invita se elige entre
  los integrantes de la mesa, incluido el titular. La aprobación real continúa
  reservada a Admin Master.
- **Pizarra:** la estructura completa se representa como árbol sinóptico de
  tarjetas simples conectadas sobre un lienzo punteado. El lienzo puede
  recorrerse con la rueda o manteniendo Espacio y arrastrando, y ofrece zoom
  visible entre 60% y 160%; cada tarjeta despliega su resumen y las tarjetas de
  personas abren la ficha completa.
  Una tarjeta verde de persona ya representa simultáneamente al administrador
  y a su mesa: sus integrantes cuelgan directamente debajo y no se agrega una
  segunda tarjeta con el nombre de esa mesa. Al desplegar una persona se ven
  fecha de alta, acuerdo de operativa propia, acuerdo de administración cuando
  corresponda e identidades activas.
- **Identificadores visibles:** el código NODAL es distinto del UUID técnico y
  puede cambiar al trasladar a la persona de mesa. Los códigos mostrados en el
  escenario ficticio son datos de prueba y no fijan todavía el algoritmo
  productivo de asignación.
- **Escenario ficticio:** invitaciones, cambios de rol, estados, acuerdos,
  adjudicaciones, conector e identidades se pueden ensayar localmente en la
  interfaz, sin escribir usuarios, mesas, correos ni contabilidad real.
- **Bonus anterior:** se elimina la escala automática de 15/30/40/50% por
  cantidad de mesas directas. No participa en cálculos nuevos ni se ofrece en
  la interfaz. Sus columnas históricas se conservan únicamente para no
  reescribir cierres previos.
- **Accesos acumulables:** `Admin` y `Admin Master` son capacidades separadas.
  Una misma persona puede reunir ambas y ve dos entradas independientes. Tener
  rol Master no elimina una mesa administrada ni convierte el panel de mesa en
  el panel global.
- **Vista excepcional de comprobación:** Mauricio puede abrir `Admin` sin crear
  una mesa ficticia. Esa vista informa que no existe una mesa asignada y se
  limita estrictamente a sus propios datos; no enumera ramas ni usuarios
  ajenos. La excepción queda persistida y revocable en una tabla protegida.
- **Escenario ficticio de revisión:** desde esa vista puede abrirse una
  estructura sintética con tres mesas anidadas, siete personas, estados,
  acuerdos, identidades, conectores y tres períodos. Se calcula con el mismo
  dominio económico que Producción, pero no crea usuarios, asientos, períodos
  ni saldos reales y se identifica visualmente en todo momento. Su retiro no
  requiere borrar historial contable.
- **Estado:** implementados la eliminación del bonus automático, el cálculo en
  cascada, el panel Admin de lectura, la separación mesa directa/estructura
  total, historial, detalle técnico, árbol y ranking. Las mutaciones delegadas
  de altas, roles, traslados, bajas y porcentajes continúan pendientes de una
  capa transaccional con autorización de rama y auditoría; no se simulan con
  controles visuales sin respaldo de servidor.

### APP-147 - Conciliación visual de transferencias broker-billetera

- **Fecha:** 2026-10-04. Ajuste solicitado tras observar una diferencia broker
  pendiente en Producción.
- **Jerarquía:** el aviso conserva dirección e importe detectados, pero presenta
  en filas legibles la billetera relacionada, fecha, importe, comisión y
  observación. Ninguno de estos cambios modifica el asiento ni su cálculo.
- **Texto:** se elimina la explicación redundante sobre el origen del importe.
  El encabezado ya informa que es una transferencia pendiente, su dirección y
  el monto detectado; el usuario sólo completa la evidencia necesaria para
  conciliarla.

### APP-146 - Corte inicial y preservación selectiva de historiales

- **Fecha:** 2026-10-04. Decisión de Mauricio para el inicio de alumnos.
- **Regla:** se conserva la información operativa y contable previa únicamente
  de Mauricio, Alfred y Sebastián. Ivo y cualquier otro usuario existente
  comienzan la aplicación desde cero.
- **Permisos separados de los datos:** la prueba operativa de Ivo como alumno se
  canceló porque requería instalar un segundo conector Ninja. Mauricio confirmó
  entonces su promoción a Admin Master sin conservar datos de prueba. El rol
  administrativo no autoriza recuperar actividad descartada y, como todo
  administrador, requiere su propio factor MFA.
- **Estado ejecutado:** el 2026-10-04 Ivo quedó `active` con rol `admin`. Conserva
  exclusivamente su fundación vacía: dos espacios de trabajo y dos períodos,
  sin cuentas, compras, controles, billeteras ni conectores. La promoción quedó
  registrada como `admin_role_granted` en `audit_events` y se ejecutó con las
  precondiciones reproducibles de
  `supabase/repairs/20261004_promote_ivo_admin.sql`.
- **Identidad de Mauricio:** el acceso administrativo
  `mamaya@nodaltrading.com` y el historial personal anterior pertenecen hoy a
  dos identidades técnicas distintas. Ambas quedan excluidas de cualquier
  limpieza automática hasta consolidarlas de forma controlada y verificable.
- **Ejecución segura:** el corte será una operación única, versionada y
  auditable, basada en una lista explícita de identidades preservadas. Antes de
  aplicarlo se obtendrá un respaldo verificable y un informe de filas afectadas;
  la eliminación en Producción requiere confirmación final de Mauricio.
- **Respaldo previo:** el 2026-10-04 se creó en Producción el esquema privado
  `private_prelaunch_20261004`. Copia las 65 tablas públicas y 205.814 filas;
  los 65 conteos de origen y copia coinciden. `anon`, `authenticated` y
  `service_role` no tienen permiso de uso sobre el esquema. El procedimiento
  reproducible queda en
  `supabase/repairs/20261004_prelaunch_logical_snapshot.sql`.
- **Ejecución completada:** el 2026-10-04 se reinició en Producción la
  información previa de Ivo, Julián y Martín. Cada usuario conserva su acceso
  activo de alumno y recibió dos espacios de trabajo y dos períodos vacíos de
  octubre de 2026; quedaron en cero sus cuentas, controles diarios, billeteras
  y conectores.
- **Preservación verificada:** Mauricio —incluidas sus dos identidades
  técnicas—, Alfred y Sebastián coinciden con el respaldo privado en espacios
  de trabajo, períodos, cuentas, compras, controles diarios, billeteras,
  conectores e identidades. Alfred conserva específicamente sus 7 identidades,
  además de 34 cuentas y 34 compras.
- **Trazabilidad del corte:** el primer intento encontró una referencia a la
  tabla obsoleta `ninja_detected_purchases` y PostgreSQL revirtió la transacción
  completa. Se corrigió el procedimiento antes de repetirlo; el segundo intento
  finalizó correctamente y registró el evento auditable
  `prelaunch_history_reset` para cada usuario reiniciado.

### APP-145 - MFA obligatorio para administración

- **Fecha:** 2026-10-04. Refuerzo previo al ingreso de alumnos.
- **Alcance:** los alumnos mantienen su acceso habitual. El rol Admin Master
  requiere una sesión Supabase `aal2`, obtenida con un código TOTP de una app
  autenticadora, antes de leer datos globales o ejecutar acciones
  administrativas.
- **Defensa en profundidad:** la exigencia se aplica en la pantalla, las rutas
  y acciones del servidor y `is_current_user_admin()` en PostgreSQL. Conocer una
  URL o invocar directamente una función no evita el segundo factor.
- **Enrolamiento:** el primer acceso administrativo muestra un QR y verifica el
  primer código. Los accesos siguientes solicitan el código temporal. El secreto
  no se registra en la base de la aplicación ni en los logs.
- **Recuperación:** la pérdida del autenticador requiere retirar el factor desde
  la administración segura de Supabase y volver a enrolarlo. Esta acción debe
  quedar reservada al propietario de la infraestructura.
- **Lectura personal:** una sesión administrativa `aal1` puede seguir viendo la
  información personal del titular, pero no recibe el agregado maestro hasta
  completar MFA.
- **Activación progresiva:** primero se publica el enrolamiento y el control de
  servidor. La barrera equivalente en PostgreSQL se activa después de que el
  propietario complete su primer enrolamiento, para evitar un bloqueo
  administrativo accidental.

### APP-144 - Actualizaciones críticas antes del ingreso de alumnos

- **Fecha:** 2026-10-04. Corrección preventiva de seguridad.
- **Hallazgo:** la versión fijada de Next.js y su procesador de imágenes
  incluían vulnerabilidades críticas y altas publicadas, aunque no existe
  evidencia de explotación en NODAL.
- **Resolución:** se fija Next.js 16.3.8, que incorpora las correcciones, y se
  actualiza la dependencia de imágenes incluida. El inventario de producción
  queda sin vulnerabilidades conocidas por `npm audit` en este corte.
- **Validación:** lint sin errores, tipos correctos, 435 pruebas aprobadas y
  compilación de producción completa antes del despliegue.
- **Regla operativa:** las dependencias de producción se auditan antes de cada
  incorporación de alumnos y toda alerta crítica bloquea el despliegue hasta
  aplicar y validar su corrección.
- **Control permanente:** GitHub ejecuta auditoría de dependencias de
  producción, lint, tipos, pruebas y compilación en cada cambio de `main` y en
  cada propuesta de cambio. Dependabot revisa semanalmente nuevas versiones y
  abre propuestas revisables; no publica actualizaciones por sí solo. Queda
  pendiente activar la protección de `main` para impedir la integración de una
  propuesta mientras estos controles estén fallando.

### APP-143 - Promoción controlada del entorno con historial real

- **Fecha:** 2026-10-04. Decisión operativa para el inicio de la migración de
  alumnos.
- **Contexto:** el único proyecto Supabase disponible ya conserva los
  historiales reales de Mauricio, Alfred y Sebastián. Crear una base nueva para
  el lunes habría exigido una migración de datos y conectores todavía no
  validada, con riesgo de perder continuidad.
- **Resolución:** se promueve en el lugar el stack existente y se conserva su
  base. La aplicación productiva queda publicada en
  `https://app.nodaltrading.com`; el dominio anterior permanece disponible por
  compatibilidad transitoria con conectores instalados. No se reinician ni se
  reescriben historiales.
- **Configuración:** Vercel identifica el despliegue como `production`, la URL
  base es `https://app.nodaltrading.com` y Supabase autoriza el retorno OAuth a
  `https://app.nodaltrading.com/**`. El endpoint de salud y el inicio de sesión
  se verifican desde el dominio definitivo.
- **Excepción temporal:** esta promoción reemplaza, para el lanzamiento
  inicial, la exigencia previa de crear proyectos nuevos e independientes de
  Supabase y Vercel. La separación de Desarrollo/Preview deberá reconstruirse
  después del lanzamiento sin mover ni modificar la base productiva.
- **Pendiente:** las vistas Preview comparten temporalmente la variable pública
  de entorno productivo; no deben utilizarse para ensayos destructivos ni con
  datos ficticios hasta recuperar un ambiente de desarrollo separado.

### APP-138 - Asignación informativa y retiro seguro de billeteras

- **Fecha:** 2026-10-03. Decisión de Producto y Contabilidad implementada.
- **Asignación:** toda billetera manual o automática puede quedar asociada al
  titular o a una identidad del mismo workspace. La asociación sólo organiza la
  información y permite mostrarla en la tarjeta de la identidad; saldos,
  movimientos, payouts y conciliaciones continúan perteneciendo a la única
  contabilidad del titular.
- **Eliminación:** una billetera sólo puede retirarse con saldo contable cero.
  Si nunca tuvo actividad se elimina. Si tiene historia económica u
  observaciones se desactiva y se oculta, conservando registros y auditoría.
  No se borran movimientos para hacer posible la eliminación.

### APP-137 - Fechas válidas en altas y movimientos contables

- **Fecha:** 2026-10-03. Corrección del alta manual de billeteras.
- **Hallazgo:** al cambiar el período contable el viernes a las 19:00, la app
  proponía la fecha calendario del fin de semana aunque la actividad del período
  siguiente comienza el primer lunes. El servidor rechazaba correctamente la
  fecha, pero la interfaz ocultaba el motivo.
- **Resolución:** los formularios contables proponen y limitan la fecha al rango
  operativo del período seleccionado. Antes del primer lunes usan ese lunes;
  después del cierre usan la última fecha válida. El alta informa expresamente
  cuando una fecha queda fuera del período.
- **Alcance:** aplica al alta de billeteras, movimientos, payouts y cobros. No
  modifica períodos, saldos ni registros económicos existentes.

### APP-136 - Alta de billeteras por proveedor y modalidad

- **Fecha:** 2026-10-03. Flujo visual definido por Mauricio mediante boceto.
- **Entrada:** `Agregar billetera` comienza con una única selección de empresa:
  ARQ, GrabrFi, Global66, MetaMask u Otra. La misma selección informa si el
  registro será manual o automático.
- **Billeteras manuales:** ARQ, GrabrFi y Global66 solicitan nombre de la
  billetera, fecha y saldo inicial. `Otra` agrega el nombre de la empresa. El
  proveedor queda incorporado en el nombre visible para distinguir cuentas sin
  ampliar silenciosamente el modelo contable.
- **MetaMask:** solicita nombre, identidad y dirección pública, crea la
  billetera sin saldo inicial y configura la lectura automática ya aprobada.
  Varias subcuentas se registran como billeteras separadas.
- **Interfaz:** se retiran del recorrido principal las explicaciones técnicas,
  los estados vacíos y las instrucciones de conciliación. Las redes compatibles
  y la advertencia de seguridad quedan disponibles de forma breve y contextual.
- **Integridad:** el alta manual conserva el asiento inicial vigente; la lectura
  automática no crea aportes, resultados ni movimientos contables.

### APP-135 - Cuentas como vista unica del resultado individual

- **Fecha:** 2026-10-02. Simplificacion funcional confirmada por Mauricio.
- **Interfaz:** se retira `Resultados por cuenta` de la orejeta Operaciones.
  La ficha desplegada de cada cuenta en `Cuentas` queda como unico lugar del
  alumno para consultar su recorrido, fase, trades, resultado e historial
  economico individual.
- **Operaciones:** conserva saldo broker, automatizacion, conciliaciones,
  operaciones detectadas e historial operativo. No repite una ficha contable
  por cuenta con un alcance temporal diferente.
- **Payouts y excepciones:** el payout se registra mediante su flujo formal y
  no mediante `TOTAL RETIRO` dentro de Operaciones. Los cambios excepcionales
  de estado contable dejan de estar disponibles en el recorrido ordinario del
  alumno y requieren un futuro flujo administrativo auditado.
- **Integridad:** no se eliminan operaciones, retiros, resultados, servicios de
  calculo ni datos historicos. El cambio retira solamente la vista duplicada y
  sus controles antiguos del recorrido visible.

### APP-134 - Fases, estados operativos, estados contables y días por trade

- **Fecha:** 2026-10-02. Definición funcional expresa de Mauricio.
- **Fases NODAL:** `Evaluación`, `Primera vuelta`, `Segunda vuelta` y vueltas
  posteriores. Toda cuenta comienza en Evaluación. El primer payout aprobado
  por la prop cierra Primera vuelta; cada payout aprobado posterior cierra la
  vuelta vigente y abre la siguiente.
- **Estados operativos:** `Evaluation`, `Funded` y `Live`. Al superar Evaluación
  comienza Primera vuelta y el estado pasa a Funded. Cambiar de vuelta no cambia
  el estado Funded; Funded a Live sigue siendo una transición independiente.
- **Estados contables:** `Virgen`, `Viva` y `Cerrada`. No deben denominarse
  estados operativos ni confundirse con los valores informados por Ninja.
- **Día:** `D1`, `D2`, `D3` es el ordinal del trade dentro de su fase, no una
  fecha calendario. Una cobertura con varias cuentas es un solo trade para cada
  participante. Al cerrar un trade la cuenta queda preparada para el día
  siguiente. Las cuatro filas de Evaluación y seis de cada vuelta son capacidad
  visual inicial, no límites operativos.
- **Automatización:** una cuenta registrada sin trades muestra `Evaluación Día
  1`; la contabilización automática avanza la vuelta únicamente por payouts
  aprobados anteriores al nuevo trade. Los informes numeran controles/trades,
  no fechas distintas.

### APP-133 - Degradado único para acciones verdes

- **Fecha:** 2026-10-02. Unificación visual solicitada por el usuario.
- **Patrón:** `Registrar cuenta` define el fondo, borde, color de texto y sombra
  canónicos de toda acción verde. Esos valores viven en variables compartidas
  y se reutilizan en la app personal, apertura, formularios y administración.
- **Jerarquía:** la unificación alcanza sólo a controles que ya son verdes. Las
  acciones neutras, de texto, cancelación y destructivas conservan su aspecto y
  significado propios.

### APP-132 - Bandeja de cuentas detectadas como tarjetas independientes

- **Fecha:** 2026-10-02. Corrección visual solicitada en Cuentas.
- **Decisión:** el estado de NinjaTrader y cada cuenta prop pendiente se
  presentan como tarjetas separadas. Cada cuenta conserva su propio formulario,
  sus acciones `Omitir` y `Registrar cuenta` y su trazabilidad de detección.
- **Alineación:** el contador de cuentas y todas las acciones de la bandeja usan
  centrado vertical uniforme; se elimina el margen heredado que desplazaba las
  acciones secundarias.
- **Ritmo vertical:** el encabezado de NinjaTrader, cada cuenta detectada y el
  resumen `Total / Activas / Vírgenes / Invertido` mantienen la misma separación
  de 12 px.
- **Alcance:** no cambia la clasificación de cuentas, las omisiones guardadas,
  la actualización del inventario ni el registro contable.

### APP-131 - Orden y jerarquía uniforme en Operaciones

- **Fecha:** 2026-10-01. Reorganización visual solicitada por el usuario.
- **Orden:** después de los indicadores se presentan `Automatización`, `Datos
  técnicos recientes`, las operaciones actuales y finalmente `Historial`.
- **Encabezados:** las tarjetas desplegables principales comparten altura,
  relleno, tipografía, tamaño, peso y tratamiento de los signos `+` y `−`.
- **Alcance:** el cambio no altera el contenido, la detección de operaciones,
  las conciliaciones ni el período conservado en el historial.

### APP-130 - Tarjeta plegable para datos técnicos recientes

- **Fecha:** 2026-10-01. Ajuste visual solicitado en Operaciones.
- **Decisión:** `Datos técnicos recientes` conserva su comportamiento plegado,
  pero su encabezado pasa a presentarse como una tarjeta completa con fondo,
  borde y altura coherentes con las demás secciones. Al desplegarla, las
  tarjetas técnicas permanecen dentro del mismo contenedor.
- **Alcance:** no cambia telemetría, conciliaciones ni datos contables.

### APP-129 - Asignación contextual dentro de cada conciliación

- **Fecha:** 2026-10-01. Simplificación de la vista Operaciones solicitada por
  el usuario.
- **Decisión:** se elimina la tarjeta global `Asignación de cuentas`. Los lotes
  que no concilian conservan sus acciones locales `Asignar cuentas` y
  `Registrar sin cobertura`, evitando dos lugares distintos para resolver el
  mismo problema.
- **Excepción:** la selección de empresa, cuenta líder, réplicas y fase se
  conserva solamente dentro del diálogo de ajuste excepcional de saldo. No se
  muestra en el recorrido normal ni modifica conciliaciones existentes.

### APP-128 - Conciliación completa como unidad visual en Operaciones

- **Fecha:** 2026-10-01. Reorganización solicitada para que Automatización no
  dependa del Historial para comprender una cobertura.
- **Decisión:** cada tarjeta de Automatización representa un lote de
  conciliación completo. Al abrirla identifica la subcuenta broker, todas las
  cuentas prop aparejadas, conexión, instrumentos, dirección, cantidad,
  apertura, cierre, duración, resultado prop y cobertura asignada.
- **Historial:** deja de presentar sesiones técnicas aisladas como si fueran
  operaciones independientes. Agrupa las conciliaciones completas y conserva
  solamente el mes calendario actual y el anterior en la vista del usuario.
  Los datos técnicos y la trazabilidad subyacente no se eliminan.
- **Contabilidad:** el cambio es de lectura y organización. Usa el lote y sus
  miembros ya persistidos; no recalcula resultados, no reasigna cuentas y no
  crea controles diarios.
- **Seguridad:** la nueva lectura está filtrada en servidor por el titular del
  conector activo y mantiene la separación entre autenticación y autorización.
- **Continuidad de exclusiones:** la vista completa mantiene fuera de la lista
  operativa las sesiones broker previamente marcadas como duplicadas o
  sustituidas. También incorpora las cuentas adjudicadas manualmente a un lote,
  aunque no tengan una sesión técnica prop asociada. Ninguna de ambas reglas
  cambia la conciliación ni sus importes.
- **Representación única:** si una asignación manual también conservó su sesión
  técnica, la cuenta se muestra una sola vez y se prioriza el detalle técnico.
  La corrección es visual y no modifica lotes, importes ni controles diarios.
- **Reversión:** checkpoint Git
  `checkpoint-before-operations-reconciliation-redesign-2026-10-01`.

### APP-127 - Fondo unificado en Operaciones

- **Fecha:** 2026-09-30. Ajuste visual solicitado al comparar Operaciones con
  Cuentas.
- **Hallazgo:** el panel blanco era el resumen `real-telemetry-overview`; una
  regla de tema claro le asignaba `background-color` con mayor especificidad y
  anulaba la transparencia general.
- **Resolución:** el resumen de telemetría queda transparente en tema claro y
  la sección Operaciones no agrega un fondo. La regla explícita prevalece sobre
  el fondo blanco del tema claro. Las tarjetas internas conservan sus bordes y
  fondos actuales.

### APP-126 - Margen visual del favicon

- **Fecha:** 2026-09-30. Ajuste solicitado tras revisar el icono en navegador.
- **Resolución:** usa un PNG cuadrado con el símbolo oficial al 81% del ancho y
  margen transparente. Evita un SVG que referenciaba otro PNG externamente y no
  se renderizaba como favicon en Chrome.

### APP-125 - Marca oficial en animación y favicon

- **Fecha:** 2026-09-30. Ajuste visual solicitado por Mauricio.
- **Resolución:** reemplaza el monograma genérico de carga por el símbolo
  oficial de NODAL, conservando transparencia y animación. El mismo recurso se
  publica como icono de la aplicación para que aparezca en la pestaña del
  navegador.
- **Alcance:** cambio visual; no modifica autenticación, datos ni operación.

### APP-124 - Escala diaria en el gráfico de Inicio y carga animada

- **Fecha:** 2026-09-30. Ajuste de experiencia solicitado durante pruebas.
- **Gráfico:** Inicio permite alternar entre Mes y Día. La escala diaria agrega
  los resultados confirmados de Control Diario por fecha operativa; no interpola
  días ni fabrica valores. La escala mensual mantiene la serie y métricas
  existentes. Un único dato se dibuja como barra para que siga siendo visible,
  y la línea de cero representa correctamente valores negativos.
- **Carga:** la pantalla privada incorpora una animación de marca en bucle con
  indicador de progreso, respetando la preferencia de movimiento reducido del
  sistema.
- **Límite:** la escala mensual necesita más de un período para mostrar una
  tendencia; la escala diaria permite inspeccionar los resultados disponibles
  dentro del período actual.

### APP-123 - Revinculación de identidades independiente del correo

- **Fecha:** 2026-09-30. Caso confirmado de Natalia, identidad de Alfred.
- **Causa:** una instalación vencida en estado `sent` seguía ocupando el índice
  único de envío abierto. La función sólo reemplazaba envíos aún vigentes y no
  podía crear el siguiente. Al desvincular, la UI ocultaba además la generación
  de código porque no encontraba conector activo ni instalación vigente.
- **Corrección:** la función reemplaza envíos previos bajo el bloqueo de la
  identidad sin filtrar por vencimiento. Conserva sus filas y la auditoría.
  Las identidades aprobadas siempre ofrecen Generar código, independientemente
  del correo; enviar/re-enviar la instalación es una acción separada.
- **Seguridad:** no cambia aprobación, permisos, duración del código ni canje.
  La revinculación conserva el conector histórico según APP-118. No se borran
  cuentas, operaciones o identidades. Los errores de red del panel son visibles.
- **Verificación:** regresión SQL con envío vencido y reenvío consecutivo dentro
  de una transacción revertida sin enviar correos; seis regresiones de interfaz
  (sin envío y estados sending/sent/downloaded/failed, identidad inactiva).
  La falta de señal inicial no se atribuye a este error: el conector revocado
  reportaba 0.4 y requiere comprobar la señal después de revincular el actualizado.

### APP-122 - Trades anteriores a la primera observación de la cuenta

- **Fecha:** 2026-09-30. Corrección técnica solicitada por Mauricio.
- **Hallazgo:** el horario de primera detección se trataba como inicio de vida
  económico. Un trade anterior, recibido durante una recuperación de conexión,
  quedaba sin cuenta aunque la compra ya estuviera registrada.
- **Resolución:** conserva la resolución temporal habitual; para un trade anterior
  a la detección permite únicamente el vínculo inicial inequívoco del mismo
  conector, conexión y cuenta externa, comprado antes o el día del trade en el
  mismo mes operativo. No extrapola vidas de reset/transición ni elige entre
  vínculos múltiples. Conserva fechas y compras; no borra ni recrea registros.
- **Reproceso:** registrar la compra dispara una revisión posterior a la respuesta.
  Telemetría y heartbeat continúan procesando en servidor sin navegador abierto.
  Se agrega revisión de cuentas y reintento autorizado por titular para bloqueos
  correlacionados. El reintento se limita a la sesión elegida, conserva los saldos
  anteriores en orden operativo y no modifica lotes ya contabilizados.
- **Mensaje:** una asociación faltante no se presenta como prueba de que falta
  comprar o registrar la cuenta. Se mantienen las validaciones de saldo, fase,
  período, deduplicación y confirmación transaccional existentes.
- **Límite:** no reconstruye ejecuciones que Ninja nunca transmitió. El conector
  existente persiste una cola y reintenta, pero tiene límite de 8 MiB y conserva
  sólo las últimas 5000 líneas al superarlo; no equivale a retención ilimitada.
  Esta corrección no requiere reinstalar ni revincular el conector.
- **Validación:** regresiones de detección tardía, fechas Buenos Aires, compras,
  cierres, vidas múltiples, resets, permisos, simulación sin escritura e
  idempotencia del reintento. Caso real: cobertura -16064 centavos y cuenta
  terminada en 0010, sin modificar la fecha de primera detección.

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

| APP-047 | Las alertas iniciales del Resumen se calculan desde datos y diferencias concretas: saldo broker ausente, conciliaciones de capital o ganancias, retiros aprobados sin cobro y estados contables forzados. Informan el origen y conducen a revisarlo; nunca corrigen valores ni marcan un período como cerrado. | Vigente |

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
- **Decisión:** El clasificador reconoce automáticamente los prefijos confirmados de Lucid Flex y MAXX, My Funded Futures, Topstep, Funded Futures Family, Tradeify y Take Profit Trader. La salida muestra empresa, producto y estado operativo en inglés (`Evaluation`, `Funded`, `Live`).
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
- **Bonus (regla histórica sustituida):** la escala automática por cantidad de
  mesas directas dejó de regir por APP-148. Se conservan sus datos únicamente
  para no reescribir períodos cerrados.
- **Ingreso total vigente:** participación de operativa propia más participación
  de mesa. Es ingreso calculado, no certificación de cobro.
- **Gestión:** Guardar aplica al período calendario actual en Buenos Aires; no hay edición de períodos anteriores ni programación futura desde esta interfaz. La pantalla de períodos históricos es de consulta. No se inventa una política de cierre contable.
- **Historial:** Registros automáticos con actor, fecha, vigencia y valores
  anteriores/nuevos para condiciones personales y reemplazo de administrador.
  Los eventos históricos del bonus eliminado se conservan, pero no se generan
  nuevos. La interfaz carga los 500 eventos globales más recientes; la tabla
  conserva todos.
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
- **Ganancias del período:** Reemplaza `Resultado neto`. Según la regla vigente
  de APP-148, suma la participación del usuario en su operativa propia después
  de comisión y su participación por administrar una mesa. El nivel vigente
  aparece en la misma tarjeta.
- **Facturación del período:** Es la suma del resultado bruto de las cuentas
  cerradas y corresponde a `Resumen operativo!O6` en la planilla. La simulación
  lo obtiene de `realizedGainInCents`: USD 10.500 en julio y USD 12.000 en
  agosto. `Capital neto aportado` conserva su significado contable independiente:
  aportes propios menos retiros personales.
- **Payouts:** Presenta cantidad registrada, importe total y cantidad pendiente
  como tres datos diferenciados.
- **Capacidades:** Mesa administrada e identidades son tarjetas opcionales e
  independientes. La capacidad histórica `mesas referidas`, ligada al bonus
  eliminado, dejó de mostrarse por APP-148. La aplicación real recibe permisos
  y agregados desde el servidor y no los infiere desde el rol visible.
- **Histórico:** El gráfico permite alternar, sin cambiar de página, entre
  ganancias totales por período y facturación por período.
  Cada punto expone mes e importe al enfocarlo o apoyar el cursor.
- **Escenario económico histórico:** el escenario original incluía el bonus
  automático por mesas referidas. Quedó sustituido por la cascada definida en
  APP-148 y no debe utilizarse para cálculos nuevos. Los administradores de las
  mesas hijas permanecen como usuarios de su mesa de origen hasta un traslado
  explícito.
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

- **Decisión vigente:** `Ganancias del período` se calcula con la estructura
  vigente del período: ganancia propia luego de comisión e ingreso por
  administración de la mesa. El bonus por mesas referidas quedó eliminado por
  APP-148.
- **Capacidades:** La tarjeta de mesa administrada muestra usuarios y facturación
  real de esa mesa. La antigua tarjeta de mesas referidas dejó de existir al
  eliminarse el bonus automático.
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
- **Alcance de riesgo:** Empresa, producto, estado operativo y tamaño forman parte de la
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
- **Decisión:** la carga normal dispone de noventa segundos durante la
  degradación confirmada. Si no concluye,
  muestra una recuperación explícita que permite reintentar y aclara que los
  registros y vínculos se conservan. Los fallos de render tienen su propio
  límite visual y no dejan una pantalla vacía.
- **Reducción de esperas:** la ruta privada verifica el JWT mediante
  `getClaims`, como recomienda Supabase para proteger páginas, evitando una
  consulta redundante a Auth. Reutiliza el usuario ya verificado en permisos y
  dashboard, y comienza en paralelo la comisión, el resumen histórico y el
  dashboard personal mientras carga el resto de la pantalla.
- **Región de ejecución:** durante el incidente de latencia de Supabase del
  30/09, Vercel atendía las funciones desde `iad1`, dentro de la zona afectada.
  La primera mitigación en `gru1` siguió alcanzando el proyecto por una ruta
  degradada; una lectura mínima demoró 63,9 segundos. La aplicación fija una
  única región `sfo1`, disponible también en el plan Hobby, para probar una
  entrada occidental que no dependa del PoP oriental afectado.
- **Salud verificable:** `/api/health?database=1` realiza una lectura protegida
  sin devolver filas ni datos personales, la interrumpe a los ocho segundos y
  publica únicamente disponibilidad y latencia. El chequeo básico continúa sin
  tocar la base.
- **Alcance:** no se inventan resultados parciales ni se reemplazan errores por
  colecciones vacías. El límite sólo decide qué interfaz ve el usuario; las
  escrituras económicas continúan fuera de los reintentos automáticos.
- **Validación:** prueba determinista del resultado normal y del vencimiento,
  además de typecheck, lint, suite completa y build de producción.

### APP-123 - Una instalación Ninja, destinos contables excluyentes

- **Fecha:** 2026-09-30. Decisión implementada. Checkpoint previo: `checkpoint/pre-identity-routing-20260930`.
- **Caso habitual:** una identidad sin app propia mantiene una sola instalación y un vínculo con el usuario NODAL titular. No se le exige crear usuario personal.
- **Caso de doble rol:** si esa misma persona también tiene app propia, la instalación existente debe poder vincular ambos destinos sin reinstalar ni reemplazar la vinculación original. Nunca se duplica un evento económico entre contabilidades.
- **Semáforo:** cada titular puede encender o apagar la recepción de cada identidad desde Identidades. A lo sumo una identidad de una instalación puede estar activa; si ninguna está activa, el destino es la app personal cuando existe. Sin app personal, la señal queda pausada. Los cambios se registran con fecha y no trasladan el historial previo; no se permiten durante una operación abierta.
- **Props:** no se preasignan en la instalación. Se detectan en el destino activo y quedan pendientes hasta registrar u omitir. La primera operación contabilizada fija su titular; cambiar el semáforo nunca mueve esa cuenta ni su historia a otra contabilidad. Una cuenta ya fijada en otro destino debe quedar en revisión, no registrarse automáticamente.
- **Omitir:** es un filtro reversible de la bandeja de cuentas nuevas, no una baja de cuenta ni una exclusión contable permanente. `Actualizar` en el bloque NinjaTrader vuelve a mostrar las omitidas. No se usa `ninja_account_registration_exclusions`, reservado para borrados auditados.
- **Broker:** el número de subcuenta y la presencia en Ninja no prueban titularidad. El titular debe confirmar una vez cada subcuenta antes de que su saldo o cobertura afecten su contabilidad. Las subcuentas ajenas o no confirmadas quedan fuera de la suma y en revisión.
- **Implementación:** el instalador 0.6 detecta una configuración existente y conserva sus credenciales. El código adicional autoriza un destino nuevo sin reemplazar el vínculo físico. La ingesta resuelve cada evento por la vigencia del semáforo y mantiene las cuentas ya adjudicadas en su conector contable. Las subcuentas broker nuevas quedan en una bandeja de confirmación y no afectan saldos hasta que el titular pulse `Es mía`.
- **Despliegue y validación:** la migración `20260930190000` quedó aplicada y registrada en Supabase. Se verificaron 12 destinos, 12 rutas vigentes, 41 props preservadas, 26 subcuentas broker preservadas y cero conectores activos sin ruta. Typecheck, lint sin errores, 335 pruebas y build de producción completaron correctamente.

### APP-124 - Alta simétrica de destinos desde una instalación existente

- **Fecha:** 2026-09-30. Corrección del instalador 0.6; no modifica reglas
  contables, historial ni permisos.
- **Decisión:** el primer destino se incorpora con `INSTALAR-NODAL`. Para
  sumar otro destino sobre la misma instalación se usa `ACTUALIZAR-NODAL`, que
  actualiza el complemento y solicita un código opcional. El código puede
  corresponder a una app propia o a una identidad y el orden es indistinto.
- **Continuidad:** pegar otro código no sustituye el destino anterior, no rota
  el conector físico y no borra configuración, cola ni historia. Presionar
  `ENTER` sin código mantiene el uso anterior de actualización solamente.
- **Interfaz:** después de generar un código, la app indica explícitamente si
  debe pegarse en `INSTALAR-NODAL` o en `ACTUALIZAR-NODAL`.

### APP-125 - Reasignación de broker personal y arranque contable limpio

- **Fecha:** 2026-09-30. Reparación puntual con prevención general.
- **Hallazgo:** la subcuenta broker `2167219` de Sebastián fue observada por el
  vínculo de identidad de Alfred antes de que existiera el destino personal.
  Cinco cierres quedaron como lotes técnicos bloqueados en Alfred; ninguno
  tenía control diario ni asiento contable confirmado.
- **Decisión contable:** no se reconstruye ese historial en la app nueva de
  Sebastián. Las cinco sesiones se conservan excluidas para auditoría, se
  retiran de las acciones pendientes de Alfred y no generan registros
  económicos. Sebastián inicia desde cero usando el último saldo observado.
- **Titularidad:** `En Vivo / 2167219` queda fijada al destino personal de
  Sebastián. Las señales futuras de esa subcuenta no pueden contabilizarse en
  Alfred aunque compartan la misma instalación física.
- **Prevención:** el heartbeat deja de reconstruir saldos desde la captura
  histórica del conector físico cuando la instalación tiene destinos
  adicionales. En ese modelo, sólo la ingesta ya enrutada puede crear o
  actualizar el saldo del destino contable real. Los conectores tradicionales
  de un único destino conservan su recuperación anterior.
- **Trazabilidad:** la reparación se registra en `audit_events` y queda
  reproducible en
  `supabase/repairs/20260930_sebastian_personal_broker_reassignment.sql`.

### APP-126 - Acceso visible al Admin Master en la app principal

- **Fecha:** 2026-10-01. Habilitación administrativa solicitada por el titular.
- **Alcance:** el acceso principal de Mauricio Amaya conserva su app, sus
  cuentas y su contabilidad personal, y suma el alcance `master` en el servidor.
  No se crea una segunda app ni se trasladan datos entre usuarios.
- **Interfaz:** la navegación lateral, móvil y la pantalla de conexión muestran
  `Admin Master` a todo usuario activo cuyo rol persistido sea `admin`, incluso
  si la sesión todavía está en `aal1`. Al ingresar, la ruta deriva al desafío
  MFA y sólo después habilita el panel protegido. Los administradores de mesa
  continúan resolviendo su alcance mediante `get_my_administration_scope`.
- **Seguridad:** la visibilidad no concede permisos por sí sola. `/app/admin`,
  sus consultas y sus acciones continúan exigiendo usuario activo con rol
  `admin` y una sesión `aal2` en el servidor. El cambio de rol queda registrado
  en `audit_events`.

### APP-127 - Calendario contable NODAL y rectificación de períodos cerrados

- **Fecha:** 2026-10-01. Decisión funcional confirmada e implementada en la app.
  La migración conserva la trazabilidad del sistema de referencia y no autoriza
  reemplazarlo antes de la conciliación paralela aprobada.
- **Calendario:** el período identificado con un mes comienza el primer lunes de
  ese mes, aunque sea feriado. El período anterior termina el viernes inmediato
  anterior a las 19:00, hora de Buenos Aires. En ese momento la aplicación
  realiza el cierre y cambia el contexto visible al período siguiente.
- **Ejemplo 2026:** septiembre termina el viernes 2 de octubre a las 19:00;
  octubre opera desde el lunes 5 y termina el viernes 30 de octubre a las 19:00;
  noviembre comienza el lunes 2.
- **Inmutabilidad:** un período cerrado no admite altas, ediciones ni borrados
  económicos por los flujos ordinarios del usuario, del conector ni del
  administrador. Su cierre conserva una fotografía versionada y auditable.
- **Rectificación:** un error posterior se trata mediante `Rectificar cierre`,
  como acción excepcional de Admin Master. Conserva el cierre original, motivo,
  responsable, fecha, evidencia, valores anterior y corregido, y genera una
  nueva versión del cierre sin reescribir silenciosamente la anterior.
- **Efecto posterior:** la diferencia se incorpora al período vigente como
  `Ajuste de período anterior`, separada de su resultado operativo y de su
  comisión. Si modifica la comisión definitiva del período rectificado, la
  diferencia de comisión también se registra de forma explícita.
- **Reconocimiento por cuenta:** el cierre reconoce como resultado realizado
  únicamente el resultado completo de las cuentas que hayan cerrado dentro del
  período. Una cuenta que inició en períodos anteriores aporta todo su recorrido
  económico al período en el que finalmente cierra; no se reparte su resultado
  entre meses.
- **Continuidad de cuentas:** las cuentas vírgenes y vivas no se cierran ni se
  duplican al cambiar de período. Conservan una identidad permanente y pasan
  íntegramente al período siguiente con compra original, origen de fondos,
  titular o identidad, empresa, fase, estado, vínculos NinjaTrader, entradas,
  retiros y flotante acumulado. El flotante final por cuenta es su flotante
  inicial en el período siguiente y no constituye por sí mismo resultado
  realizado ni comisión.
- **Corte operativo:** no se diseña un caso de órdenes ejecutadas después de las
  19:00 del viernes de cierre porque el mercado se encuentra cerrado. El cambio
  de contexto contable ocurre a esa hora. Si excepcionalmente el conector
  entrega una operación después de ejecutado el cierre, la cuenta ya trasladada
  determina el período abierto siguiente: se conserva la fecha técnica real,
  pero el registro contable pertenece íntegramente al nuevo período. No se
  reabre ni se rectifica automáticamente el período anterior.
- **Comisión de usuario NODAL:** el porcentaje es individual. Se fija desde
  Admin Master al dar de alta al usuario NODAL y solamente puede modificarse
  desde ese panel. Durante el período el importe calculado es dinámico; al
  cierre se guardan como definitivos el porcentaje aplicable, la base, el
  importe de comisión y el resultado del usuario. Un cambio posterior de
  porcentaje no recalcula cierres anteriores.
- **Vigencia del porcentaje:** cada período utiliza un único porcentaje para
  todo su resultado realizado. Si Admin Master lo modifica mientras el período
  permanece abierto, la nueva tasa recalcula íntegramente la comisión total de
  ese período, incluidas las cuentas que hubieran cerrado antes del cambio. Una
  vez cerrado, el porcentaje y la comisión quedan congelados. Habitualmente el
  cambio se realizará después del cierre anterior y antes de la apertura
  operativa del siguiente período, por lo que regirá para todo el período nuevo.
- **Identidades:** sus porcentajes de comisión serán independientes y podrán
  administrarse desde el panel del usuario NODAL habilitado para tener
  identidades. La regla, permisos, vigencia y efecto contable se definirán más
  adelante; no se infieren en esta decisión.
- **Automatización:** Producción ejecuta diariamente una función privada a las
  22:00 UTC, equivalentes a las 19:00 de Buenos Aires. La función es idempotente,
  sólo cierra períodos vencidos y exige el secreto exclusivo `CRON_SECRET`.
  El cierre se aplica a los espacios Real y Práctica para mantener sus
  calendarios alineados.
- **Ventana de ejecución aprobada:** el plan Hobby de Vercel usa una ventana
  flexible de hasta una hora para cron jobs. Se acepta que el proceso automático
  se ejecute entre las 19:00 y las 20:00. El corte contable guardado continúa
  siendo las 19:00 y la base impide cerrar antes; la demora técnica no modifica
  el período al que pertenece cada registro ni exige cambiar de plan.
- **Conciliaciones al corte:** una diferencia no impide el cierre. El período se
  congela como `closed_with_observations`, conserva ambas diferencias y Admin
  Master debe resolverla con explicación y evidencia o rectificar sus importes.
  La resolución no borra el estado observado original.
- **Control operativo:** cada ejecución automática o manual conserva inicio,
  fin, origen, cantidad de períodos vencidos, cierres completados y fallas. Admin
  Master puede consultar el estado y reintentar períodos vencidos sin duplicar
  cierres ya realizados.

### APP-128 - Informes PDF de cierre y aprobación de Admin Master

- **Fecha:** 2026-10-02. Aprobación y generación del informe individual implementadas; factura y envío pendientes de integrar.
- **Cierre automático:** a la hora de corte el sistema congela el período, traslada las cuentas vivas y abre el siguiente sin esperar intervención humana. La versión resultante queda pendiente de aprobación; la aprobación no modifica el corte ni la pertenencia temporal de las operaciones.
- **Aprobación:** Admin Master revisa la fotografía contable y aprueba explícitamente la última versión mediante un check. Un cierre con observaciones sin resolver no puede aprobarse. Una rectificación crea una versión nueva que requiere su propia aprobación; nunca hereda la anterior.
- **Revisión asistida futura:** antes de aprobar, Admin Master podrá ejecutar un agente de revisión contable. Sus reglas, evidencia y alcance se definirán antes de implementarlo y no se presuponen en esta decisión.
- **Formato:** el informe es exclusivamente PDF y no se ofrece como descarga en la app del usuario. Admin Master dispone de una vista previa protegida antes de aprobar.
- **Resumen individual:** cada versión cerrada congela y genera un PDF propio con portada contable, operaciones cerradas en orden decreciente, cuentas prop agrupadas dentro de una misma cobertura, último trade, rendimiento por identidad y, cuando corresponda, la mesa del titular con el desglose integrante/administrador/NODAL.
- **Usuario NODAL:** recibirá por correo su informe individual aprobado junto con la factura correspondiente.
- **Administrador de mesa:** tendrá un cierre consolidado de su mesa y el
  desglose autorizado por usuario e identidad.
- **Admin Master:** tendrá un informe global consolidado, además del acceso a
  los informes de mesa e individuales.
- **Fuente:** los informes se generan desde fotografías versionadas del cierre,
  nunca recalculando silenciosamente un período histórico con datos vigentes.
- **Persistencia y control:** la fotografía se conserva en `period_closure_reports` y el PDF en el bucket privado `period-close-reports`, ambos ligados a una única `period_closure_versions`. Una rectificación genera otro informe. La base rechaza la aprobación cuando el informe de esa versión no está listo y el ejecutor automático reintenta informes faltantes o fallidos sin volver a cerrar el período.
- **Entrega:** aprobar crea una entrega auditable en estado `awaiting_documents`; no se envía ningún mensaje hasta que el PDF y la factura estén disponibles. El destinatario se congela con el correo del usuario, el remitente será `noreply@nodaltrading.com` y el asunto comenzará con `Cierre período`.
- **Google Workspace:** la integración recomendada es Gmail API con una cuenta de servicio limitada a `gmail.send` y delegación de dominio, con secretos fuera del repositorio. `noreply@nodaltrading.com` será un alias de envío autorizado y usará `Reply-To: contacto@nodaltrading.com`; no se habilita SMTP por contraseña común. Esta alternativa evita depender de una IP fija de Vercel y permite auditar cada identificador de mensaje devuelto por Google.
- **Contacto:** `contacto@nodaltrading.com` se planifica como Grupo de Google con bandeja colaborativa y `mamaya@nodaltrading.com` como miembro inicial. De ese modo recibe comunicaciones externas, permite responder como equipo y no exige otra licencia. Si NODAL necesita inicio de sesión Gmail y buzón totalmente independiente, deberá crearse en cambio como usuario pago de Workspace.
- **Configuración aplicada en Workspace:** el 2026-10-01 se creó `noreply@nodaltrading.com` como alias de `mamaya@nodaltrading.com` y `contacto@nodaltrading.com` como Grupo de Google con bandeja colaborativa. Mauricio es propietario; las personas externas pueden publicar por correo, sólo los invitados pueden incorporarse y sólo propietarios, administradores y miembros pueden ver conversaciones y miembros. Las respuestas del grupo usan `contacto@nodaltrading.com` como remitente predeterminado.
- **Límite de esta configuración:** las direcciones ya existen, pero la aplicación aún no posee una credencial de Gmail API ni permiso delegado para enviar. Esa credencial se creará como una decisión separada, con alcance explícito, cuando estén listos el PDF, la factura y el trabajador de entrega.
- **Pendiente documental:** construir la factura, definir la comisión propia de las identidades y configurar la credencial autorizada de Gmail API. Hasta completar esos tres puntos, una aprobación deja el despacho en `awaiting_documents` y no envía correo.

### APP-129 - Progreso visual por fase y checkpoints de payout

- **Fecha:** 2026-10-02. Decisión funcional confirmada e implementada en la app.
- **Ubicación:** cada tarjeta de cuenta desplegada muestra una barra compacta de potencia entre sus datos principales y las acciones o el historial económico. El espacio es flexible y se adapta al contenido disponible; no replica una dimensión fija de la maqueta.
- **Rotulado:** la barra no agrega un título genérico; conserva sólo la fase y el día actuales, el nivel y los hitos alcanzados.
- **Alcance vigente:** la barra representa Evaluación y desde Primera hasta Quinta vuelta. El componente se construye desde el catálogo ordenado de fases y admite agregar fases posteriores sin rediseñar su estructura; no se incorporan todavía fases de negocio no aprobadas.
- **Semántica:** la potencia va de `0/5` en Evaluación a `5/5` en Quinta vuelta. Cada avance completa el color de la fase anterior y deja visible una carga mínima del color siguiente: verde para Evaluación, amarillo para Primera vuelta, naranja para Segunda, magenta para Tercera, azul para Cuarta y un remate violeta al alcanzar Quinta. El día operativo actual se muestra como texto contextual, pero no modifica el nivel porque una fase no posee una cantidad obligatoria de trades.
- **Checkpoints:** aprobar Evaluación y alcanzar el estado operativo `Funded` constituye el primer hito en `1/5`, aunque todavía no exista un payout. Cada payout aprobado queda marcado después con una línea oscura y un cartel por fuera de la barra. El primer payout se ubica en `2/5`, al completar Primera vuelta y entrar en Segunda; los siguientes respetan la misma secuencia. Todos los hitos alcanzados muestran un check; la fecha y el importe de cada payout permanecen disponibles en su detalle.
- **Movimiento:** el relleno activo respira y presenta un brillo muy sutil en bucle. La animación se desactiva cuando el dispositivo solicita reducción de movimiento.
- **Registro de payouts:** el selector ofrece únicamente cuentas con estado operativo `Funded` y estado contable `Viva`. El historial identifica expresamente la cuenta asociada.
- **Integridad:** la base rechaza cuentas no elegibles y un segundo payout activo para la misma cuenta y vuelta. El control se ejecuta con bloqueo de la cuenta para evitar duplicados concurrentes.

### APP-130 - Continuidad Evaluation a Funded independiente del semáforo

- **Fecha:** 2026-10-02. Corrección confirmada después del caso real de Natalia Albini en Tradeify.
- **Hallazgo:** Ninja reemplazó cinco nombres `TDFYSL` por cinco `FTDFYSLX`. El conector continuó observando objetos históricos mediante `Account.All` y el enrutamiento descartó los nombres funded nuevos porque la identidad estaba pausada y todavía no tenían titularidad propia. La app conservó las tarjetas Evaluation anteriores.
- **Inventario del conector:** desde la versión 0.7 se enumeran exclusivamente las cuentas expuestas por `Accounts` dentro de cada conexión activa. Una cuenta retirada de la conexión deja de permanecer activa por el solo hecho de que su objeto histórico siga dentro de la colección global de NinjaTrader.
- **Continuidad contable:** un nombre Funded sin titularidad hereda el destino de las cuentas Evaluation compatibles ya adjudicadas en la misma conexión, que alcanzaron el objetivo y todavía están pendientes de transición, cuando existe un único destino inequívoco. Esta continuidad se aplica antes que el semáforo vigente; una evaluación histórica ya resuelta no puede apropiarse de una funded futura.
- **Semáforo:** pausar una identidad impide adjudicarle cuentas prop nuevas sin historia, pero no rompe la titularidad ni la detección de una transición de fase de cuentas que ya le pertenecen.
- **Ambigüedad:** si las evaluaciones compatibles pertenecen a más de un destino, no se infiere continuidad y el caso permanece retenido para revisión. Nunca se mueve una cuenta entre contabilidades por aproximación.

### APP-131 - Retiro temporal de movimientos manuales de broker en Operaciones

- **Fecha:** 2026-10-02. Decisión funcional confirmada e implementada en la app.
- **Interfaz:** se elimina de Operaciones la tarjeta `Registrar saldo excepcional`. La ausencia de datos en vivo de NinjaTrader no habilita por sí sola la carga de un movimiento económico manual.
- **Alcance:** Operaciones acepta solamente saldos asociados a un evento real e identificable del conector de NinjaTrader. También se bloquean en el servidor los depósitos, retiros y simulaciones manuales, incluso si una pestaña antigua conserva la interfaz anterior.
- **Datos existentes:** no se eliminan ni se recalculan movimientos históricos ya registrados. Permanecen disponibles para trazabilidad y conciliación.
- **Pendiente de Contabilidad:** depósitos y retiros se incorporarán más adelante mediante un flujo contable específico, con origen o destino, fecha, período, evidencia, autorización, contrapartida y trazabilidad definidos antes de habilitar su registración.

### APP-132 - Compatibilidad de compilación del conector Ninja 0.8

- **Fecha:** 2026-10-02. Corrección implementada y publicada para las instalaciones existentes.
- **Hallazgo:** el conector 0.7 declaraba un método auxiliar llamado `ConnectionStatus` y también utilizaba el enum homónimo de NinjaTrader. Algunas instalaciones resolvían el identificador como el método y producían `CS0119` al compilar.
- **Corrección:** la versión 0.8 renombra el método auxiliar y referencia de forma explícita `NinjaTrader.Cbi.ConnectionStatus.Connected`, eliminando la ambigüedad entre versiones del compilador de NinjaTrader.
- **Actualización:** `ACTUALIZAR-NODAL.cmd` reemplaza únicamente el código del complemento. Conserva vínculos, credenciales cifradas, historial y cola de telemetría; no requiere un nuevo código de vinculación.

### APP-133 - Menú de usuario y versiones visibles

- **Fecha:** 2026-10-02. Menú implementado en el espacio personal y en los paneles administrativos.
- **Acceso:** al pulsar el nombre o avatar se despliega un menú con `Configuración`, `Ayuda` y `Versión`. Se cierra al pulsar fuera o presionar Escape y mantiene navegación por teclado.
- **Versión de la app:** se muestra la versión declarada del producto y la revisión corta exacta del despliegue, permitiendo identificar qué código está utilizando el usuario.
- **Versión del conector:** se muestra la última versión que el conector instalado informó mediante su heartbeat, junto con su estado en línea o sin señal. Una falta de señal no borra la última versión conocida.
- **Referencia:** el menú también informa la última versión de conector publicada por NODAL. Esta referencia no sustituye la versión instalada recibida desde NinjaTrader.
- **Alcance inicial:** Configuración queda como espacio reservado y Ayuda ofrece contacto por `contacto@nodaltrading.com`; sus funciones adicionales se definirán posteriormente.

### 2026-10-03 — Ayuda y tickets de soporte

- **Configuración:** permanece sin nuevas opciones hasta definir una necesidad concreta del alumno.
- **Ayuda:** presenta `Preguntas frecuentes` como función futura y `Contacto` como acceso a una página independiente abierta en una pestaña nueva.
- **Ticket:** sólo un usuario autenticado y activo puede crear una solicitud. Se conservan categoría, asunto, descripción, identidad solicitante, fecha, estado y código de seguimiento; se limita la creación reiterada y se registra el alta y el envío en auditoría.
- **Correo:** el servidor crea un token temporal de un solo propósito y el puente autorizado de Google Apps Script consulta el ticket, envía el mensaje exclusivamente a `contacto@nodaltrading.com` y confirma el despacho. No se exponen credenciales de correo ni se permite elegir un destinatario arbitrario desde el cliente.

### APP-134 - Trazabilidad de actualización del conector

- **Fecha:** 2026-10-02. Implementado desde el conector 0.9.
- **Problema corregido:** una actualización copiaba el nuevo archivo fuente, pero la app sólo conocía la versión del último ejecutable que había enviado un heartbeat. El menú podía rotular una versión histórica como instalada sin explicar que el conector estaba sin señal.
- **Tres estados separados:** la app distingue la última versión publicada por NODAL, la versión de código que `ACTUALIZAR-NODAL.cmd` copió en NinjaTrader y la versión compilada que se encuentra realmente en ejecución.
- **Registro local:** el actualizador extrae la versión incluida en el archivo fuente y la conserva como `InstalledSourceVersion` sin modificar vínculos, credenciales, historial ni cola.
- **Comunicación:** desde 0.9, cada heartbeat autenticado informa tanto la versión en ejecución como la versión de código copiada. El servidor las guarda por separado y nunca interpreta una copia como compilación exitosa.
- **Compatibilidad:** la lectura ampliada se publica como `get_current_user_ninja_connector_status_v2`; la función anterior se conserva para no interrumpir despliegues o clientes todavía activos durante la transición.
- **Diagnóstico:** si el código copiado es más nuevo que el runtime, el menú indica que falta compilar o reiniciar NinjaTrader. Si el runtime es anterior a la última publicación, muestra una actualización disponible. Si no existe señal, conserva los últimos valores conocidos y lo declara expresamente.
- **Límite de transición:** las versiones anteriores a 0.9 no pueden informar retrospectivamente el código copiado. La primera actualización a 0.9 seguirá figurando como pendiente o desconocida hasta que un conector compatible vuelva a emitir señal; desde entonces las actualizaciones futuras se detectarán antes de activar el nuevo runtime.

### APP-135 - Resultado firmado, continuidad de períodos y conciliación verificable

- **Fecha:** 2026-10-03. Implementación autorizada por el usuario para una solución universal, no un ajuste específico de su flotante.
- **Presentación:** se distinguen resultado del período, resultado acumulado y resultado de cuentas vivas (flotante) con su signo económico. Un flotante negativo no se convierte en ingreso. El saldo contable del broker no se sustituye visualmente por una observación de Ninja; esta se informa por separado.
- **Conciliación del período:** compara los movimientos (resultado broker menos compras más payouts aprobados menos gastos) con la clasificación por cuentas (cerradas más variación firmada de vivas menos variación del costo de vírgenes más broker sin cobertura menos gastos). Todos los renglones visibles suman el total mostrado. Una diferencia de origen permanece como diferencia: no se fabrica una contrapartida.
- **Continuidad:** el cargador compartido reconstruye el inicio desde el resumen congelado anterior y los traslados individuales persistidos. La compra no vuelve a descontarse al cambiar de período; el resultado acumulado anterior tampoco vuelve a reconocerse como resultado del mes nuevo.
- **Evidencia:** se controlan cantidad, estado e importes de los traslados, su correspondencia con el cierre previo, la composición histórica disponible y la existencia de compras. La falta de evidencia se presenta como no verificable y se conserva como observación del cierre, incluso si alguna diferencia numérica es cero.
- **Históricos:** no se escriben ni recalculan resúmenes o informes aprobados. `floatingInCents` conserva compatibilidad como magnitud histórica; `resultDetails.liveResultInCents` aporta el signo a las nuevas vistas e informes. Los resúmenes antiguos sin detalle firmado no se muestran como una nueva conciliación verificada. Las aperturas migradas sin detalle individual siguen disponibles, pero no se inventa el detalle faltante.
- **Fuente única:** la pantalla personal utiliza `loadPeriodSummaries`, igual que los consumidores administrativos y el cierre automático. Se retira su cálculo local duplicado. Las rectificaciones aprobadas se conservan explícitas y separadas, incluyendo el arrastre histórico.
- **Validación:** regresiones con vivas negativas y positivas, cuentas vírgenes nuevas y trasladadas, cierres con ganancia y pérdida, payouts y fees, broker sin cobertura, evidencia faltante, diferencias intencionales e inmutabilidad de cierres previos. Comprobación de datos de desarrollo exclusivamente de lectura, sin crear asientos ni modificar saldos.
- **Fuera de alcance:** no cambia la regla de comisión, las fases o los estados contables. Los nuevos flujos de depósitos, retiros, transferencias y cobro de pendientes entre períodos requieren una revisión específica posterior; esta corrección no los da por resueltos.

### APP-137 - Billeteras manuales y evidencia cripto separada del libro

- **Fecha:** 2026-10-03. Autorizado por Mauricio. Implementado localmente; activación pendiente de acceso Supabase y clave Alchemy. Moralis se descartó al comprobar que su plan gratuito dejó de operar y su costo actual no fue aceptado.
- **Regla:** la lectura de USDT/USDC no constituye aporte, ingreso ni payout. El saldo nominal detectado se muestra separado del saldo contable USD. No se altera la regla económica ni se fuerza una conciliación.
- **Identidad:** cada dirección EVM corresponde a una billetera del workspace, con identidad opcional; no se duplica por usar MetaMask y Trust Wallet con la misma dirección.
- **Evidencia:** ingesta idempotente por red/hash/log y vínculo explícito al movimiento o cobro existente. Una transferencia interna conserva un asiento con dos extremos. Sin clasificación automática ni reconocimiento automático de payouts.
- **Seguridad:** lectura pública sin semillas o claves privadas; proveedor sólo en servidor, RLS, control de titular activo, auditoría y períodos abiertos para vinculaciones. Falta de red conserva última lectura, nunca un cero ficticio.
- **Límites y verificación:** ver `38_WALLETS_CRIPTO.md`. No hay cobertura universal de redes ni lectura real validada aún. La prueba SQL remota está bloqueada por sesión administrativa vencida; no se publicó ni se aplicó migración remota.

### APP-136 - Código adicional rechazado no detiene el conector Ninja

- **Fecha:** 2026-10-03. Corrección del caso de Alfred durante la actualización del conector.
- **Hallazgo confirmado:** NinjaScript Output mostraba `VINCULO_ADICIONAL_RECHAZADO` seguido de `ENVIO_RECHAZADO`. Un `PairingCode` adicional vencido o ya utilizado quedaba en la configuración; `EnsureAuthorizationAsync` intentaba canjearlo antes de cada envío y devolvía `false` aunque la sesión principal siguiera vigente. Por eso no se enviaban el inventario ni la versión y la app retenía el último valor conocido (0.4). La señal de actividad de otros canales no demostraba que el latido de versión hubiese sido aceptado.
- **Conector 0.10:** un rechazo definitivo HTTP 409 del código adicional lo descarta localmente y conserva la sesión autenticada. El inventario y el latido continúan. Rechazos transitorios o de autenticación no descartan el código.
- **Actualizador:** al elegir solo actualizar y presionar ENTER, quita cualquier código adicional pendiente, conserva tokens cifrados, destinos vinculados y cola de telemetría, y crea una copia local de la configuración anterior. Si se ingresa un código nuevo, mantiene el flujo de vinculación adicional.
- **Servidor:** el latido registra la versión informada antes de reconstruir operaciones y transiciones; una falla posterior no deja una versión antigua como aparente revisión activa. Los errores al guardar la versión se registran para diagnóstico.
- **Verificación:** pruebas de la ruta y del paquete; la activación efectiva en la PC de Alfred requiere que ejecute el actualizador corregido y compile o reinicie NinjaTrader. La app solo debe mostrar 0.10 tras recibir el latido de ese ejecutable.

### APP-139 - Presentación de saldos manuales y automáticos

- **Fecha:** 2026-10-03.
- **Regla visual:** una billetera manual presenta su saldo contable; una
  billetera automática presenta la última lectura válida de USDT/USDC.
- **Total disponible:** toma una sola fuente por billetera. En una billetera
  automática reemplaza visualmente el saldo contable por la observación; nunca
  suma ambos importes.
- **Trazabilidad:** el saldo contable continúa visible por separado y cualquier
  diferencia se expone como pendiente de conciliar y hace que la conciliación
  general requiera revisión. Si una billetera automática todavía no tiene una
  lectura válida, la conciliación queda pendiente de verificar. La observación
  no crea ni modifica movimientos, aportes, ganancias o payouts.
- **Interfaz:** la actualización manual de una fuente automática pertenece a la
  tarjeta principal de esa billetera. No se repite la billetera en un bloque
  técnico separado debajo del alta.
- **Historial:** el formulario de movimientos permanece como acción principal;
  los movimientos del período se agrupan en `Ver historial de movimientos`,
  cerrado inicialmente para no extender la tarjeta a medida que crece el mes.
- **Sin duplicación:** `Movimientos económicos` no repite movimientos de
  billetera ni payouts, porque ambos conservan su historial específico. La
  cronología general queda reservada para registros económicos que no poseen
  otra vista propia.
- **Formulario de payout:** cuenta, fecha de aprobación e importe se presentan
  con etiquetas visibles y una grilla uniforme. Si no existe una cuenta viva
  con una vuelta Funded operada, el alta permanece deshabilitada.

### APP-140 - Transferencias con broker y cobro efectivo de payouts

- **Fecha:** 2026-10-03. Circuito confirmado por Mauricio e implementado en la app.
- **Entrada y salida del broker:** todo aporte externo destinado al broker pasa primero por una billetera y todo retiro personal del broker pasa por una billetera. Las compras de cuentas prop pueden pagarse directamente con tarjeta u otros fondos del trader; conservan `Aporte nuevo del trader`.
- **Billetera y broker:** una variación de saldo broker sin operación Ninja pendiente se concilia como transferencia interna `billetera → broker` o `broker → billetera`. La app toma el importe de la diferencia detectada; el usuario elige la billetera, fecha y fee. Un único acto guarda ambos extremos con vínculo auditable y no duplica el saldo.
- **Comisiones:** la transferencia interna conserva el capital total únicamente cuando no existe fee. El fee real reduce el saldo del circuito y se registra como gasto del período.
- **Prioridad operativa:** si Ninja detectó una operación abierta, en asentamiento o todavía no contabilizada, la diferencia continúa en Operaciones. Contabilidad no ofrece simultáneamente la conciliación como transferencia.
- **Payout aprobado:** registra cuenta, vuelta, fecha e importe y avanza el progreso operativo, pero permanece `Pendiente`. No acredita ninguna billetera ni reduce el flotante de la cuenta.
- **Cobro del payout:** `Confirmar cobro` exige billetera, fecha efectiva y fee. En una única transacción acredita el importe neto a la billetera, reduce el flotante de la cuenta por el importe bruto y registra el fee como gasto. El cobro puede ocurrir en un período posterior al de aprobación.
- **Históricos:** los payouts anteriores a esta decisión conservan su tratamiento original mediante una marca de compatibilidad. No se reescriben resultados ni cierres ya emitidos.
- **Trazabilidad:** transferencias, cobros, fechas, billeteras, fees y períodos quedan auditados. Las lecturas automáticas de una wallet siguen siendo evidencia y no crean movimientos por sí solas.

### APP-141 - Auditoría de vistas personales y lecturas verificadas

- **Fecha:** 2026-10-03. Correcciones confirmadas por Mauricio.
- **Cuentas:** el resumen incluye vivas y vírgenes trasladadas y cuentas del período actual; excluye cerradas de períodos anteriores. El archivo de cerradas conserva su historial y conteo. Se retira el contador de compras junto al título. Los filtros contables preceden a los operativos con separación visual y sin encabezados adicionales.
- **Operaciones:** saldo broker primero, indicadores después. Se retira `Último cierre`, cuya fuente no representaba el historial actual, y el mensaje vacío heredado. Automatización conserva sólo pendientes; las conciliadas aparecen en Historial. El indicador de posiciones se llama `Posiciones prop abiertas`.
- **Inicio y Contabilidad:** importes con centavos; `Billeteras y otros saldos`; selector vacío `Sin cuentas Funded vivas`. Se unifica `Ganancia por operativa propia` en cabecera y períodos.
- **Lecturas:** las consultas necesarias para presentar datos financieros deben completarse correctamente. Una consulta fallida o sin respuesta exige reintentar y no se convierte en cero ni en historial vacío. Un cero o una colección vacía recibidos correctamente continúan siendo válidos.
- **Fondos:** se aclara APP-140: el tránsito obligatorio por billeteras se refiere al broker, no a compras directas de cuentas prop.

### APP-142 - Tarjetas destacadas y confirmación transitoria

- **Fecha:** 2026-10-03. Solicitud de Mauricio.
- **Estética:** Inicio es la referencia de degradado, Arial, peso, tamaño y color del importe para Saldo broker y Facturación. Se conservan las distribuciones compactas de cada vista y ambos temas.
- **Registro de cuentas:** la confirmación de compra desaparece a los cinco segundos y elimina sólo `purchase_result=created` de la URL, conservando navegación y demás parámetros. Los errores no desaparecen automáticamente. No cambia el registro económico.
- **Estado del conector:** `En vivo` aparece sólo junto al saldo broker de Operaciones, donde informa la frescura del dato. Inicio muestra el saldo sin repetir el estado y Contabilidad diferencia saldo contable de saldo detectado.
- **Escala tipográfica:** compartir identidad visual no implica igualar tamaños. La Facturación de Contabilidad usa una escala compacta acorde a su tarjeta y conserva más espacio negativo que las tarjetas principales de Inicio y Operaciones.

### APP-152 - Solicitudes directas visibles para Admin Master

- **Fecha:** 2026-10-05. Corrección posterior a las primeras altas reales de alumnos.
- **Hallazgo:** el ingreso con Google mostraba `Acceso pendiente` al alumno, pero no creaba necesariamente un perfil pendiente en `nodal_users`. Admin Master sólo consultaba invitaciones de mesas y usuarios ya incorporados, por lo que cinco solicitudes del día quedaron únicamente en `auth.users` y no aparecieron en su consola.
- **Captura:** el primer ingreso y cada autenticación posterior crean de forma idempotente el perfil pendiente cuando todavía no existe. Nunca se modifica un perfil activo o revocado.
- **Recuperación:** la migración incorpora las solicitudes omitidas el día de activación conservando UUID, correo, nombre de Google y fecha original. No autoriza a nadie automáticamente.
- **Aprobación:** Admin Master dispone de una sección `Solicitudes de apertura`. Aprobar prepara Real y Práctica, asigna al usuario a la Mesa Principal con su acuerdo inicial y conserva auditoría; rechazar revoca el acceso sin borrar la identidad autenticada.
- **Visibilidad:** la navegación Master incluye `Solicitudes` y la vista general muestra un aviso con el total pendiente. Los usuarios pendientes quedan fuera de la estructura económica hasta ser aprobados.

### APP-153 - Consola global de Admin Master y depuración de accesos

- **Fecha:** 2026-10-05. Diseño funcional basado en el mockup aprobado por Mauricio.
- **Separación de alcance:** Admin Master representa el Sistema NODAL completo y no reutiliza el concepto de una mesa personal. Panel Admin continúa limitado a la rama de la mesa que administra cada titular.
- **Jerarquía:** la consola presenta Sistema NODAL, unidades, Mesa Principal, mesas dependientes, usuarios e identidades. Una tarjeta verde de persona representa a un Admin y, por lo tanto, a la mesa que administra; no se duplica con una segunda tarjeta `Mesa de ...`.
- **Datos:** indicadores, ranking, usuarios, IDs, conectores, identidades y pizarra se alimentan de registros reales. Las solicitudes pendientes se mantienen fuera de los cálculos y aparecen en `Altas y alertas`.
- **Acceso global:** Admin Master puede consultar cualquier usuario y sus registros. La conexión Ninja conserva versión, última transmisión y actividad derivada de las últimas 24 horas; no es un selector editable.
- **Navegación:** la consola se organiza en `Panel control`, `Registros` y `Estadísticas`. Las aprobaciones se acceden desde el indicador de altas y alertas del Panel control.
- **Limpieza preproductiva:** se revocaron de forma lógica y auditada `mamaya@nodaltrading.com`, Martin Mainardi y Julián Seco. No se eliminaron perfiles, autenticaciones ni historiales. Continúan activos Mauricio Gmail, Alfred, Sebastián, Ivo y Rodolfo; las altas nuevas permanecen pendientes hasta aprobación explícita.
- **IDs iniciales:** la nómina activa confirmada recibió los correlativos `USERND-MP-01` a `USERND-MP-05` según fecha de ingreso a la Mesa Principal. La asignación quedó registrada en el historial de gestión y no creó ni alteró acuerdos económicos.

### APP-154 - Escenarios aislados de comprobación administrativa

- **Fecha:** 2026-10-05. Solicitud de Mauricio para validar la adaptación del diseño antes de operar sobre datos reales.
- **Alcance:** Panel Admin y Admin Master disponen de escenarios ficticios completos, accesibles mediante `?demo=1` únicamente para `mauriciosebastianamaya@gmail.com`.
- **Aislamiento:** los escenarios se construyen en memoria y no crean usuarios, mesas, identidades, invitaciones, solicitudes, operaciones ni registros económicos. Los controles simulados nunca llaman acciones de servidor productivas.
- **Panel Admin:** conserva el árbol ficticio aprobado, fichas, ranking, invitaciones y edición visual de roles, estados y porcentajes. Guardar o invitar sólo modifica el estado local de la vista.
- **Admin Master:** presenta cuatro unidades completas con mesas principales y dependientes, usuarios, administradores, identidades, IDs por unidad, métricas, alertas, ranking y pizarra jerárquica ficticios. Los filtros de unidad y mesa afectan la tabla, el ranking y la pizarra. Los enlaces que podrían abrir registros reales quedan deshabilitados dentro del escenario.
- **Prueba de unidades:** el escenario Admin Master permite agregar y editar unidades sólo en memoria. Las ventanas respetan el mockup con nombre de empresa, abreviatura única de dos letras, responsable, e-mail y porcentaje de acuerdo NODAL. La Mesa Principal se deriva del nombre de la empresa y la edición actualiza los IDs ficticios de la unidad sin tocar la base productiva.
- **Sistema visual:** Admin Master reutiliza tipografía, radios, bordes, fondos, alturas de campo y espaciado de la aplicación. Las tarjetas de unidad conservan el gradiente verde aprobado; la selección intensifica el fondo y el borde sin cambiar su estructura.
- **Cabecera:** Admin Master usa una sola identificación de pantalla. El encabezado global no repite “Panel de administración”, la cabecera del panel no muestra el mes y el escenario ficticio evita duplicar el total “Altas y alertas” cuando ya presenta solicitudes y alertas de conector por separado. El menú reutiliza la foto del perfil autenticado.
- **Registro ficticio:** la orejeta Registros del escenario de comprobación sigue el mockup aprobado: selección de unidad, descarga simulada, aprobación total, selección individual por ID NODAL y envío simulado. Ninguna de estas acciones modifica cierres productivos.
- **Lectura del árbol:** al desplegar una persona, la pizarra muestra ID, fecha de alta, acuerdos, identidades y estado/versión del conector, manteniendo el mismo lenguaje informativo aprobado para el árbol del Panel Admin.
- **Filtros inmediatos:** unidad, mesa y usuario se aplican al seleccionarlos. El período recarga automáticamente el período elegido; no existe un segundo botón de confirmación.

### APP-154 - Promoción del diseño aprobado de Admin Master a producción

- **Fecha:** 2026-10-06. Diseño aprobado y trasladado a las vistas reales.
- **Panel control:** la vista productiva utiliza la misma distribución, jerarquía visual, filtros, tarjetas, tabla, fichas y pizarra aprobadas en el escenario ficticio, alimentadas exclusivamente por unidades, mesas, usuarios, IDs y cifras reales. El acceso visible al escenario de diseño se retira del panel productivo.
- **Registros:** la orejeta productiva adopta la cabecera, selección de unidad, listado por usuario y acciones del mockup aprobado. La descarga exporta únicamente los registros reales seleccionados. La aprobación múltiple reutiliza la función auditada de aprobación de cierres; conserva los bloqueos por informe pendiente y observaciones sin resolver, y genera la entrega en el mismo estado controlado que la aprobación individual.
- **Conservación funcional:** el control detallado de cierres, PDF, observaciones, rectificaciones, ejecuciones y reintentos permanece disponible dentro de la misma orejeta. La adaptación visual no elimina ni sustituye esas funciones.
- **Aislamiento:** no se copian las cuatro unidades, usuarios, importes ni alertas ficticias a producción. `?demo=1` continúa siendo una comprobación aislada y no se ofrece como acción dentro del panel real.
- **Gestión real de unidades:** las ventanas de alta y edición utilizan una única operación transaccional restringida a Admin Master. El alta crea conjuntamente la unidad, su Mesa Principal y el acuerdo vigente; la edición sincroniza nombre, abreviatura, responsable, e-mail, acuerdo e IDs visibles activos. Cada cambio conserva actor, período, motivo, estado anterior y estado resultante en el historial de gestión. Una falla revierte toda la operación y no deja estructuras parciales.
- **Identificación visual:** ambas vistas indican de forma persistente que se trata de datos ficticios y ofrecen volver a los datos reales.

### APP-155 - Nómina activa corregida y solicitudes visibles en Panel control

- **Fecha:** 2026-10-06. Corrección confirmada por Mauricio antes de aprobar las altas pendientes.
- **Nómina:** Ivo Pirrone y Rodolfo Augusto Thumann no deben integrar todavía la nómina activa. Sus accesos se revocan de forma lógica y auditada; se conservan autenticación, perfiles, registros e historial.
- **Correlativos:** `USERND-MP-01` y `USERND-MP-05` permanecen como identificadores históricos y no se reasignan ni provocan la renumeración de otros usuarios.
- **Estructura visible:** los cálculos, el ranking, la tabla y la pizarra de Admin Master incluyen únicamente usuarios con acceso activo. Un perfil pendiente o revocado nunca integra la estructura económica vigente.
- **Solicitudes:** las solicitudes directas pendientes se muestran con nombre, correo y fecha dentro de `Panel control`, además de la pantalla de revisión. La tarjeta lleva a las acciones de aprobar o rechazar ya auditadas.

### APP-156 - Estado operativo y deterioro automático de identidades

- **Fecha:** 2026-10-06. Definición funcional de Mauricio para la orejeta Identidades.
- **Estado manual:** el titular clasifica cada identidad como `Desconfigurada`, `Configurada`, `Activa` o `Muerta`. Esta clasificación se guarda con autorización por espacio y auditoría, separada del onboarding, la documentación, las credenciales y el conector.
- **Estado inicial:** las identidades existentes comienzan como `Desconfigurada`; no se infiere su estado operativo desde cuentas, señales o datos históricos.
- **Empresa quemada:** una empresa de fondeo se considera quemada desde su cuarto payout aprobado y vigente. El cálculo usa `funding_withdrawals` activos y las asignaciones explícitas de cuentas a la identidad; no cuenta importes ni movimientos de billetera.
- **Deterioro:** sólo una identidad en estado `Activa` muestra deterioro. Cero empresas quemadas se presenta como `Sin deterioro`; una, dos o tres o más empresas quemadas corresponden a `Deterioro 1`, `Deterioro 2` y `Deterioro 3` respectivamente.
- **Círculos de poder:** cada tarjeta muestra todas las empresas de fondeo vigentes, el conteo de payouts y el progreso visual hacia cuatro. La animación es decorativa y respeta la preferencia de movimiento reducido.
- **Pizarra:** el titular aparece como raíz y sus identidades como nodos. La vista admite zoom, centrado y desplazamiento con espacio; cada identidad despliega estado, deterioro, empresas quemadas y payouts registrados.

### APP-157 - Solicitudes de reactivación visibles

- **Fecha:** 2026-10-06. Corrección del primer reingreso real posterior a la limpieza preproductiva.
- **Reingreso:** una persona revocada que vuelve a autenticarse con Google pasa a `pending`; no recupera acceso por iniciar sesión y requiere una nueva decisión de Admin Master.
- **Conservación:** se mantiene el UUID, el ID NODAL y todo el historial. La solicitud no recupera el rol administrativo anterior: vuelve como `Usuario` y una elevación futura requiere su flujo explícito.
- **Trazabilidad:** el cambio de `revoked` a `pending` registra el estado y rol anteriores, la fecha y el motivo. Las solicitudes producidas antes de publicar esta regla se recuperan sólo cuando el último ingreso es posterior a la baja.
- **Interfaz:** `Solicitudes` permanece visible en la navegación de Admin Master. El aviso destacado del Panel control aparece sólo cuando hay solicitudes pendientes, para no dejar una tarjeta vacía después de resolverlas.

### APP-158 - Roles administrables y porcentaje de mesa

- **Fecha:** 2026-10-06. Comportamiento confirmado por Mauricio para la ficha de usuario de Admin Master.
- **Selector:** Admin Master puede asignar desde la ficha los estados `Usuario`, `Admin` y `Admin Master`. El cambio se guarda en servidor y queda registrado en el historial de gestión.
- **Capacidades:** `Admin` representa la administración de una mesa. `Admin Master` conserva el permiso global y, desde este selector, también incluye una mesa administrada. El almacenamiento mantiene separadas ambas capacidades para no confundir autorización global con jerarquía comercial.
- **Porcentaje:** al seleccionar `Admin` o `Admin Master` aparece `% mesa`; al seleccionar `Usuario` se oculta. El valor se valida entre 0% y 100% y se guarda en puntos básicos.
- **Integridad:** no se puede quitar el rol Admin mientras existan usuarios o mesas dependientes, ni retirar el propio acceso de Admin Master desde la ficha. Siempre debe quedar al menos un Admin Master activo.
- **Solicitudes resueltas:** el bloque destacado de solicitudes desaparece del Panel control cuando el contador llega a cero; la orejeta `Solicitudes` permanece disponible para consultar y gestionar nuevas altas.

### APP-159 - Descarga y extracción segura del conector Ninja

- **Fecha:** 2026-10-06. Corrección a partir de la primera actualización ejecutada por Ivo.
- **Hallazgo:** al abrir `ACTUALIZAR-NODAL.cmd` desde la vista interna del ZIP, Windows copiaba únicamente el `.cmd` a una carpeta temporal. El instalador PowerShell y el código del complemento quedaban dentro del archivo comprimido, por lo que la actualización fallaba antes de tocar NinjaTrader.
- **Prevención:** `INSTALAR-NODAL` y `ACTUALIZAR-NODAL` verifican primero que el paquete completo haya sido extraído. Si falta el instalador, se detienen sin cambios y muestran instrucciones concretas para usar `Extraer todo`.
- **Interfaz:** las pantallas de descarga, recuperación y generación de código indican que el ZIP debe extraerse antes de ejecutar cualquiera de los comandos.
- **Destino:** las instalaciones nuevas usan `https://app.nodaltrading.com` como dirección oficial. Las actualizaciones conservan los vínculos, credenciales, historial, cola y configuración existentes.

### APP-160 - Inventario completo de cuentas conectadas en NinjaTrader

- **Fecha:** 2026-10-06. Corrección general a partir de la apertura real de Ivo.
- **Hallazgo:** NinjaTrader mostraba cuentas broker conectadas en la grilla `Accounts`, pero la colección de cuentas de la conexión utilizada por el conector no siempre las incluía. El heartbeat seguía activo y transmitía sólo una parte del inventario, por lo que la app mostraba incorrectamente que era necesario conectar NinjaTrader.
- **Fuente:** el conector v0.11 obtiene el inventario desde la colección global `Account.All`, que es la misma fuente del diagnóstico local, y conserva únicamente cuentas cuya conexión propia está activa. Las cuentas se deduplican por conexión y nombre antes de transmitirlas.
- **Apertura:** si existe señal e inventario pero todavía no llegó una cuenta broker, la interfaz distingue ese caso de una desconexión y solicita actualizar el conector. No se confirma una apertura con saldo cero inferido ni se elige silenciosamente una cuenta simulada.
- **Alcance:** la corrección es común a todos los usuarios y no agrega excepciones por persona, cuenta o proveedor.

