# Conector NODAL para NinjaTrader

El conector es un complemento de solo lectura. Observa las conexiones, cuentas
y saldos disponibles en NinjaTrader y los envía a NODAL. La versión 0.4 también
registra ejecuciones y cambios de posición para validar el inicio y cierre de
una operatoria. No puede crear, modificar ni cerrar operaciones.

## Actualizar o agregar otro vínculo

Para una instalación existente, ejecutar `ACTUALIZAR-NODAL.cmd` y compilar
`NodalNinjaConnector` en NinjaTrader. El comando actualiza los archivos y luego
permite pegar opcionalmente otro código. Si se pega un código, agrega ese destino
sin sustituir los vínculos anteriores; si se presiona `ENTER`, descarta cualquier
código adicional pendiente y solamente actualiza. Conserva un respaldo local de
la configuración anterior.
La configuración, el historial y la cola cifrada se conservan en ambos casos.

El procedimiento es el mismo en cualquier orden: una instalación que comenzó
como identidad puede sumar una app propia, y una instalación que comenzó como
app propia puede sumar una identidad. El código generado determina el destino;
el instalador no necesita preguntar qué clase de vínculo es.

La versión 0.5 conserva las credenciales ante respuestas fallidas, incluso
un rechazo: sólo una nueva vinculación explícita las reemplaza. Distingue
renovación pendiente y autorización rechazada en NinjaScript Output.
La configuración se reemplaza atómicamente, con respaldo, después de cifrarla.
Las desconexiones de red no borran cuentas, operaciones ni credenciales.

La versión 0.6 permite usar la misma instalación con más de un espacio NODAL.
Al ejecutar `INSTALAR-NODAL.cmd` con un código adicional, conserva la sesión
existente y agrega el destino. El titular enciende o pausa cada identidad desde
su app; el servidor fecha cada cambio y evita duplicar el mismo evento entre
contabilidades. Las props ya registradas permanecen en su contabilidad original.

La versión 0.7 toma el inventario desde las cuentas que cada conexión activa
expone actualmente. Ya no usa la colección global histórica de NinjaTrader,
que puede conservar objetos de cuentas reemplazadas después de una actualización
o de un cambio de Evaluation a Funded.

La versión 0.8 conserva ese comportamiento y corrige una ambigüedad de nombres
que algunas versiones de NinjaTrader interpretaban como el error de compilación
`CS0119`. La actualización no modifica vínculos, credenciales, historial ni cola.

La versión 0.9 registra por separado el código copiado por el actualizador y la
versión que NinjaTrader está ejecutando. La app puede indicar si los archivos ya
se actualizaron pero todavía falta compilar o reiniciar para activar la versión.

La versión 0.10 descarta un código adicional cuando el servidor confirma que ya
venció, fue usado o corresponde a un destino ya vinculado. La sesión existente
continúa enviando inventario y latidos. Un error de red o del servidor no
descarta el código, para que pueda reintentarse.

## Vinculación

1. El alumno inicia sesión en NODAL y genera un código de ocho caracteres.
2. Descarga y descomprime `NODAL-Ninja-Connector.zip` en la PC donde corre NinjaTrader.
3. Hace doble clic en `INSTALAR-NODAL.cmd` y pega ese código.
4. El instalador copia el complemento automáticamente; el alumno solo debe
   compilar `NodalNinjaConnector` en NinjaScript Editor.
5. El conector canjea el código una sola vez y guarda en Windows una credencial
   cifrada para ese usuario.

Después de vincularse, el conector continúa enviando aunque el alumno cierre la
web o salga de su sesión de Google. La credencial puede renovarse y revocarse
desde NODAL. Se admite un destino por usuario y por identidad aprobada dentro
de una misma instalación.
Una nueva vinculación rota las credenciales y conserva el identificador lógico
y todo su historial dentro del mismo usuario e identidad.

## Estado y seguridad

- Envía un latido cada 15 segundos.
- Conserva temporalmente los eventos pendientes en una cola local cifrada y
  vuelve a enviarlos después de una interrupción de red.
- Muestrea saldos como máximo una vez por segundo y envía inmediatamente una
  muestra al cambiar una posición.
- NODAL puede considerar desconectado el complemento cuando deja de recibirlo.
- Las conexiones nuevas quedan separadas hasta que un administrador las revise.
- No utiliza Machine ID, una clave universal ni credenciales del broker.
- El archivo local de credenciales queda protegido para el usuario de Windows
  que realizó la vinculación.

El instalador usa actualmente la dirección HTTPS privada de prueba de NODAL.
`http://localhost:3000` queda reservado para desarrollo técnico explícito. Al
publicar el dominio final deberá sustituirse la dirección de prueba por la URL
oficial de producción.
