# MIMICAL dentro de NODAL App: contexto, decisiones y plan funcional

Actualizado: 26 de octubre de 2026.  
Estado: definición aprobada; piloto personal 1.1 implementado para Julián y pendiente de validación en SIM.  
Producto relacionado: **MIMICAL 1.1**, complemento NinjaScript de NodalBots para NinjaTrader 8.

## 1. Propósito de este documento

Este documento consolida el contexto de negocio, la función actual de MIMICAL y
las decisiones tomadas para utilizarlo como incentivo de adopción de NODAL App.
También separa expresamente:

- lo que ya fue decidido;
- lo que existe hoy en MIMICAL;
- lo que todavía debe diseñarse o construirse;
- lo que fue analizado y luego descartado como estrategia principal.

No reemplaza las reglas contables ni operativas de NODAL. La aplicación debe
seguir respetando el baseline de NODAL Core y las definiciones de Contabilidad,
Gestión y Operaciones. Las rutas operativas confidenciales no se reproducen aquí.

## 2. Contexto de negocio

NODAL reúne usuarios que operan cuentas de empresas de fondeo y utilizan cuentas
broker propias para cubrir su operativa. La aplicación organiza su contabilidad,
cuentas, identidades, movimientos, resultados, comisiones y trazabilidad.

En este modelo existen tres figuras distintas:

### 2.1. Usuario NODAL

Es el titular de una contabilidad personal en la aplicación. Puede operar en su
propio NinjaTrader, tener una o más cuentas o subcuentas broker de su propiedad y
registrar identidades que funcionen como extensiones de su operatoria.

### 2.2. Identidad

Es una persona que presta su identidad para la adquisición de cuentas prop y
aporta una PC con NinjaTrader. Habitualmente, el usuario NODAL controla esa PC de
forma remota, conecta allí las cuentas prop compradas por esa identidad y utiliza
una cuenta o subcuenta broker de su propiedad para la cobertura.

La identidad:

- no tiene una contabilidad NODAL independiente;
- es una extensión de la contabilidad del usuario titular;
- puede utilizar una subcuenta broker distinta de la cuenta principal del
  titular;
- necesita una instalación física propia de los complementos en la PC donde se
  ejecuta NinjaTrader;
- debe transmitir sus datos al espacio contable del usuario que la registró.

Una misma cuenta broker observada desde varias PC continúa siendo una única
cuenta económica. Subcuentas broker diferentes, aunque pertenezcan al mismo
usuario, deben conservarse como cuentas diferentes.

### 2.3. Trader o usuario dependiente de una mesa

Un trader no es una identidad. Es otro usuario NODAL con su propia cuenta broker,
su propia contabilidad y sus propios resultados, aunque esté asignado a la rama
de un administrador y participe de acuerdos de comisiones.

Por esa razón, el administrador no activa MIMICAL por el trader desde su mesa.
Cada trader gestiona su propia instalación desde su dashboard personal.

## 3. Problema estratégico original

Inicialmente se analizó la posibilidad de detectar identidades o traders no
declarados mediante supervisión de Chrome Remote Desktop u otras señales del
equipo. El objetivo era reunir indicios de actividad realizada por fuera de
NODAL para evitar la omisión de comisiones.

La investigación mostró límites importantes:

- una actividad enteramente externa, sin NODAL ni conectores, no deja datos en
  la aplicación;
- una extensión de navegador puede desactivarse, omitirse o no cubrir otros
  perfiles, navegadores o equipos;
- observar una conexión remota no prueba qué actividad se realizó ni quién la
  ejecutó;
- el monitoreo agrega riesgos legales, de privacidad, soporte y falsos
  positivos;
- ninguna señal aislada permite demostrar que existe una identidad fantasma.

### Decisión vigente

NODAL no basará su estrategia principal en vigilar o impedir la actividad
externa. Los usuarios pueden elegir operar con otras herramientas. La estrategia
vigente es de **adopción voluntaria por valor**: lograr que registrar correctamente
al usuario, trader o identidad sea más simple y conveniente que operar por fuera.

El documento sobre supervisión queda únicamente como antecedente de una
alternativa evaluada. No forma parte del alcance aprobado de MIMICAL.

## 4. Papel de MIMICAL en esa estrategia

MIMICAL será el principal incentivo operativo del ecosistema NODAL. Su valor no
consiste en impedir técnicamente toda operatoria externa, sino en ofrecer
funciones superiores e integración directa con NODAL.

La propuesta es:

- cualquier persona puede seguir utilizando copiadores externos;
- quien registre correctamente su Ninja personal o sus identidades puede acceder
  a MIMICAL;
- la licencia, configuración, actualización, soporte e integración se administran
  desde NODAL App;
- dar de alta una identidad debe ser más fácil que mantenerla por fuera;
- la ausencia de MIMICAL no se considera prueba automática de ocultamiento o
  incumplimiento.

MIMICAL funciona así como beneficio del registro y no como herramienta de
vigilancia.

## 5. Qué es MIMICAL actualmente

MIMICAL 1.0 es un complemento NinjaScript para NinjaTrader 8 desarrollado por
NodalBots. Reproduce el núcleo operativo de un copiador de órdenes y agrega una
gestión particular de la cobertura.

Sus funciones actuales incluyen:

- copiar órdenes desde una cuenta líder hacia cuentas seguidoras seleccionadas;
- utilizar ratios positivos para mantener el sentido y negativos para invertirlo;
- copiar entre instrumentos relacionados mediante `Cross Order`;
- admitir ratios decimales, truncando la cantidad hacia cero;
- mantener sincronizados cambios de precio de órdenes pendientes;
- impedir que una modificación realizada en una seguidora se propague hacia la
  líder u otras cuentas;
- administrar un trailing específico para la cuenta de cobertura negativa;
- disponer de `FLATTEN ALL` exclusivamente como acción de emergencia;
- conservar configuración entre ciclos y reconstruirla cuando el grupo está
  plano y sin órdenes activas.

La metodología, las rutas, las cantidades, el stop loss, el take profit y las ATM
siguen siendo decisiones de Operaciones. MIMICAL copia y administra la cobertura;
no inventa ni modifica silenciosamente la estrategia.

## 6. Estado técnico actual de MIMICAL

MIMICAL se abre desde `New > NodalBots > MIMICAL` y detecta las cuentas conectadas
a NinjaTrader. La selección de cuentas reales es explícita: el operador debe
elegir qué cuentas participan.

La versión validada al 21 de octubre de 2026 fue:

- AssemblyVersion: `1.0.0.0`;
- FileVersion: `1.0.0.2`;
- distribución actual: ZIP importable desde
  `Tools > Import > NinjaScript Add-On`;
- validación realizada únicamente con cuentas SIM;
- sin Vendor ID ni licenciamiento individual implementado todavía.

La validación existente cubre las secuencias simuladas documentadas en el informe
técnico, incluyendo límites cruzadas, fills parciales, activación tardía del
trailing, restauración de salidas y cierre completo. Aún faltan pruebas de
distribución en otras PC, conexiones reales, actualización, recuperación y
soporte operativo antes de utilizarlo como dependencia de una operatoria real.

## 7. Decisión de distribución

MIMICAL seguirá siendo un complemento NinjaScript importable mediante ZIP, del
mismo modo que otros Add-Ons de NinjaTrader.

Decisiones confirmadas:

- MIMICAL no forma parte obligatoria del ejecutable del conector NODAL;
- el instalador `.exe` del conector y el ZIP de MIMICAL son artefactos distintos;
- instalar el ZIP de MIMICAL no habilita su uso;
- para funcionar, cada copia necesita una licencia individual vinculada desde
  NODAL App;
- el mismo ZIP general puede utilizarse en distintas PC; lo individual es el
  vínculo de licencia, no necesariamente el archivo descargado.

Esta separación permite actualizar el conector y MIMICAL con ciclos diferentes,
reducir acoplamiento y conservar una experiencia compatible con NinjaTrader.

## 8. Unidad de licencia

Cada instalación física y cada contexto declarado consumen una licencia propia.

Las plazas previstas son:

1. **Ninja personal del usuario:** una licencia asociada al usuario titular y a
   su instalación personal.
2. **Ninja de una identidad:** una licencia asociada al usuario titular, a la
   identidad registrada y a la instalación física utilizada por esa identidad.
3. **Ninja de un trader:** una licencia personal del trader, administrada desde
   su propio dashboard NODAL.

Una identidad adicional no reutiliza silenciosamente la licencia personal del
usuario. Una reinstalación o cambio de PC debe poder revocar el vínculo anterior
y registrar uno nuevo con trazabilidad.

La licencia busca organizar el acceso al producto y evitar la cesión casual. No
demuestra que no existan otras actividades o instalaciones externas.

## 9. Vinculación mediante código temporal

La experiencia acordada es similar conceptualmente a la vinculación histórica
del conector, pero aplicada a la licencia de MIMICAL.

### Flujo confirmado

1. El usuario instala el ZIP general de MIMICAL en NinjaTrader.
2. Desde NODAL App elige el contexto que desea activar: su Ninja personal o una
   identidad registrada.
3. NODAL genera un código temporal, contextual y de un solo uso.
4. El usuario ingresa ese código en MIMICAL dentro de NinjaTrader.
5. MIMICAL canjea el código contra el servidor de NODAL.
6. El servidor vincula la instalación con:
   - el usuario titular;
   - la instalación física;
   - y, cuando corresponda, la identidad seleccionada.
7. El código se invalida y no se conserva como credencial permanente.
8. A partir de ese momento la licencia se valida de forma transparente durante
   el uso normal.

El código no es la licencia. Es únicamente una autorización breve para crear el
vínculo correcto.

### Reinstalación o cambio de PC

Debe existir una acción explícita para desvincular o revocar la instalación
anterior y generar un código nuevo. El historial debe conservar quién realizó la
acción, para qué contexto, cuándo y qué instalación fue sustituida.

## 10. Integración acordada en NODAL App

### 10.1. Nueva orejeta Configuración

Se agregará una orejeta visible llamada **Configuración** en la navegación
principal, al mismo nivel que Inicio, Cuentas, Operaciones, Contabilidad e
Identidades.

La opción que hoy existe dentro del menú desplegable del usuario debe continuar,
pero también debe existir como acceso directo desde la navegación principal.

### 10.2. Estructura de Configuración

La pantalla seguirá la estética actual de NODAL App y se organizará mediante
secciones o tarjetas grandes. No se diseñará exclusivamente para MIMICAL.

La primera sección será:

**Complementos**

Dentro de ella aparecerá una tarjeta de MIMICAL con, como mínimo:

- descripción breve del complemento;
- versión disponible;
- estado de la licencia personal;
- estado de vinculación de la instalación;
- última actividad conocida, si existe;
- descarga del ZIP oficial;
- acción para generar el código temporal;
- acción para revocar o reemplazar una instalación;
- mensajes claros de soporte o error.

La arquitectura visual y técnica debe permitir agregar en el futuro otros
complementos de NodalBots sin rehacer la pantalla.

### 10.3. Configuración de identidades

Cada tarjeta de identidad en la orejeta Identidades tendrá un botón llamado
**Configuración**.

Al pulsarlo se abrirá una ventana flotante con una estructura equivalente a la
configuración personal, pero limitada a esa identidad. Dentro de
`Complementos > MIMICAL` se podrá:

- consultar si esa identidad tiene licencia habilitada;
- descargar el ZIP general;
- generar un código temporal específicamente vinculado a esa identidad;
- consultar la instalación enlazada y su última actividad;
- revocar o reemplazar el vínculo;
- ver instrucciones breves de instalación y soporte.

El código generado desde una identidad no puede terminar asociado al Ninja
personal ni a otra identidad.

### 10.4. Traders y administradores

Los administradores no generan licencias de MIMICAL para los traders de su mesa.
Cada trader, por ser usuario NODAL con contabilidad propia, activa su licencia
desde su propia Configuración.

Admin Master podrá gestionar habilitaciones, cupos, bloqueos y soporte, pero la
interfaz operativa normal seguirá perteneciendo al usuario titular.

## 11. Estados que la aplicación debe separar

La implementación no debe reducir todo a un único indicador de “conectado”. Como
mínimo debe distinguir:

- complemento disponible;
- licencia habilitada o no habilitada;
- código temporal emitido, utilizado, vencido o revocado;
- instalación vinculada o sin vincular;
- licencia válida, suspendida o revocada;
- última validación de licencia;
- última actividad técnica de MIMICAL;
- versión instalada;
- actualización disponible;
- estado del conector NODAL.

Una licencia habilitada no prueba que MIMICAL esté instalado o abierto. La
actividad de MIMICAL tampoco prueba que el conector esté transmitiendo. Ambos
sistemas deben diagnosticarse por separado.

## 12. Relación entre MIMICAL y el conector NODAL

El conector y MIMICAL son productos relacionados, pero cumplen funciones
distintas:

| Componente | Función principal |
|---|---|
| Conector NODAL | Transmitir de forma autorizada inventario, saldos y eventos necesarios para la app. |
| MIMICAL | Copiar órdenes y administrar funciones operativas adicionales, incluida la cobertura. |
| NODAL App | Gestionar usuarios, identidades, licencias, configuración, contabilidad y trazabilidad. |

La vinculación de una licencia MIMICAL debe aprovechar la identidad ya definida
por NODAL, pero no debe reutilizar una credencial permanente del conector ni
confundir la señal de ambos componentes.

La integración futura podrá simplificar descargas e instrucciones, pero no debe
crear una dependencia técnica que impida actualizar o recuperar cada componente
por separado.

## 13. Seguridad y comportamiento ante fallos

Principios confirmados:

- los códigos de activación serán aleatorios, de un solo uso, de corta duración
  y ligados al contexto elegido;
- no se almacenarán credenciales de NinjaTrader, broker ni prop firms;
- las credenciales permanentes no viajarán en el nombre del ZIP ni se mostrarán
  nuevamente al usuario;
- toda emisión, canje, revocación, reemplazo y cambio de estado debe quedar
  auditado;
- el servidor debe validar autorización y titularidad; la interfaz por sí sola
  no concede permisos;
- una interrupción del servidor, red o licencia nunca debe abandonar ni cerrar
  de forma insegura una posición existente;
- MIMICAL debe terminar de forma segura el ciclo activo y aplicar cualquier
  restricción únicamente al inicio de ciclos nuevos, según una tolerancia
  previamente definida y probada;
- una licencia revocada no debe borrar historial técnico o contable.

La duración exacta de la tolerancia sin conexión y la política de renovación
siguen pendientes de definición y prueba.

## 14. Telemetría y privacidad

La telemetría de MIMICAL se limitará a información necesaria para:

- validar licencias;
- ofrecer soporte;
- detectar versiones incompatibles;
- diagnosticar fallos del complemento;
- integrar correctamente los eventos autorizados con NODAL;
- mejorar el producto.

No se incorpora, por esta decisión, supervisión de Chrome Remote Desktop,
captura de pantallas, teclas, archivos personales ni navegación. Cualquier
telemetría deberá explicarse de forma transparente y proporcional.

La falta de actividad o validación puede deberse a red, NinjaTrader cerrado,
fallo técnico o desuso. No constituye por sí sola una infracción.

## 15. Modelo funcional mínimo propuesto

Esta sección es una propuesta técnica para implementar las decisiones; los
nombres definitivos de tablas y servicios pueden variar.

### Entidades sugeridas

- `addon_products`: catálogo de complementos de NodalBots.
- `addon_entitlements`: habilitación de un complemento para un usuario y un
  contexto personal o de identidad.
- `addon_pairing_codes`: códigos temporales de vinculación.
- `addon_installations`: instalación física vinculada, versión y última señal.
- `addon_license_events`: historial inmutable de emisión, canje, renovación,
  revocación y reemplazo.

### Reglas mínimas

- cada habilitación pertenece a un usuario titular;
- el contexto puede ser personal o una identidad perteneciente a ese usuario;
- un trader utiliza contexto personal propio;
- un código sólo puede canjearse una vez y dentro de su vencimiento;
- una instalación no puede reasignarse silenciosamente entre titulares o
  identidades;
- las lecturas y mutaciones administrativas se autorizan en el servidor;
- la revocación no borra eventos históricos;
- las licencias y estados de instalación no alteran directamente la
  contabilidad.

## 16. Experiencia objetivo

La experiencia buscada para el usuario personal es:

1. Abrir `Configuración`.
2. Entrar en `Complementos > MIMICAL`.
3. Descargar el ZIP oficial si aún no está instalado.
4. Pulsar `Vincular MIMICAL`.
5. Copiar el código temporal.
6. Abrir MIMICAL en NinjaTrader e ingresarlo una única vez.
7. Ver en NODAL la confirmación de instalación vinculada.
8. Utilizar MIMICAL normalmente sin volver a cargar códigos.

Para una identidad:

1. Abrir `Identidades`.
2. Entrar en la tarjeta correspondiente.
3. Pulsar `Configuración`.
4. Abrir `Complementos > MIMICAL`.
5. Generar el código de esa identidad.
6. Ingresarlo en MIMICAL instalado en la PC de la identidad.
7. Confirmar que NODAL muestra el nombre correcto de la identidad y la instalación
   enlazada.

## 17. Qué no se decidió ni se implementó todavía

Quedan abiertos:

- cantidad de licencias incluidas por usuario, nivel o plan;
- existencia y precio de licencias adicionales;
- quién puede habilitar o suspender licencias desde Admin Master;
- duración exacta del código temporal;
- frecuencia y tolerancia de validación en línea;
- política ante pérdida prolongada de conexión;
- mecanismo de actualización del ZIP;
- firma y protección del assembly;
- diseño visual definitivo de Configuración y de la ventana de identidades;
- métricas exactas de última actividad;
- tratamiento de una identidad eliminada que todavía tenga una instalación
  vinculada;
- migración de futuras versiones de MIMICAL;
- pruebas reales con distintas conexiones y proveedores;
- condiciones comerciales, contractuales y de soporte.

No existe todavía en NODAL App:

- la orejeta principal Configuración para complementos;
- el catálogo extensible de complementos;
- el modelo de licencias de MIMICAL;
- la generación y canje de códigos para MIMICAL;
- la configuración de complementos por identidad;
- un panel Admin Master de licencias;
- telemetría productiva de MIMICAL.

## 18. Orden recomendado de implementación

### Etapa 1: contrato funcional y seguridad

- cerrar unidad de licencia, cupos, permisos administrativos y tolerancia de red;
- definir el protocolo de emisión y canje;
- documentar el comportamiento seguro durante operaciones activas;
- establecer qué telemetría es necesaria y visible para el usuario.

### Etapa 2: backend independiente de la interfaz

- crear catálogo, habilitaciones, códigos, instalaciones y auditoría;
- implementar servicios deterministas y testeables;
- separar autenticación, autorización, licencia y estado técnico;
- validar aislamiento entre usuarios e identidades.

### Etapa 3: integración en MIMICAL

- agregar pantalla de vinculación;
- canjear el código temporal;
- conservar la credencial de instalación de forma segura;
- validar licencia sin afectar ciclos activos;
- informar versión y actividad técnica mínima.

### Etapa 4: interfaz NODAL App

- agregar la orejeta Configuración;
- construir la sección extensible Complementos;
- implementar la tarjeta personal de MIMICAL;
- agregar Configuración a cada identidad;
- construir la gestión de soporte en Admin Master.

### Etapa 5: pruebas controladas

- segunda PC limpia;
- reinstalación y reemplazo de equipo;
- usuario con varias identidades;
- misma cuenta broker observada desde varias PC;
- pérdida y recuperación de red;
- licencia revocada con ciclo activo;
- actualización de versión;
- aislamiento entre usuarios, identidades y traders;
- prueba en SIM antes de cualquier conexión real.

### Etapa 6: piloto y despliegue

- piloto con un usuario y una identidad;
- conciliación con la aplicación y soporte observado;
- ampliación gradual;
- ejecución paralela sin convertir MIMICAL en requisito hasta aprobar las pruebas
  operativas y técnicas.

## 19. Criterios de aceptación generales

La integración se considerará lista para un piloto cuando:

- un usuario pueda vincular su instalación personal sin intervención manual de
  base de datos;
- pueda vincular una identidad y el servidor impida usar ese código en otro
  contexto;
- un trader administre su propia licencia;
- una reinstalación revoque o reemplace correctamente la instalación anterior;
- la app diferencie licencia, instalación, actividad de MIMICAL y estado del
  conector;
- un fallo de licencia o red no deje posiciones sin protección;
- Admin Master disponga de auditoría y herramientas de soporte;
- la interfaz admita un segundo complemento sin rediseño estructural;
- las pruebas demuestren aislamiento entre usuarios e identidades;
- no se modifique ninguna regla contable ni operativa de forma implícita.

## 20. Resumen ejecutivo de lo acordado

1. NODAL buscará adopción por utilidad, no mediante vigilancia como estrategia
   principal.
2. MIMICAL será el incentivo operativo central por sus funciones adicionales.
3. El ZIP será general; cada instalación necesitará una licencia individual.
4. La activación se hará con un código temporal de un solo uso generado por
   NODAL App.
5. El usuario vinculará su Ninja personal desde una nueva orejeta
   `Configuración > Complementos`.
6. Cada identidad tendrá su propio acceso a Configuración y su propia licencia
   MIMICAL.
7. Los traders administrarán su licencia personal; no serán tratados como
   identidades.
8. La solución se diseñará para incorporar más complementos de NodalBots.
9. Licencia, instalación, actividad de MIMICAL y señal del conector serán estados
   separados.
10. Un fallo de validación nunca pondrá en riesgo una operación ya abierta.
11. MIMICAL todavía está en prueba y la integración con NODAL App aún no fue
    construida.
12. El despliegue deberá ser gradual, auditable y probado primero en SIM.

## 21. Fuentes internas relacionadas

- `docs/03_DECISIONES_TECNICAS.md`, decisión APP-192.
- `docs/CONTEXTO_SUPERVISION_IDENTIDADES_NO_DECLARADAS.mp`, antecedente de la
  estrategia de supervisión posteriormente descartada.
- `C:\Users\mauri\Downloads\CONTEXTO_MIMICAL_2026-10-23.md`, estado técnico y
  validación de MIMICAL 1.0 suministrados para esta consolidación.

