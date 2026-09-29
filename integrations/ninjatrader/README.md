# Conector NODAL para NinjaTrader

El conector es un complemento de solo lectura. Observa las conexiones, cuentas
y saldos disponibles en NinjaTrader y los envía a NODAL. La versión 0.4 también
registra ejecuciones y cambios de posición para validar el inicio y cierre de
una operatoria. No puede crear, modificar ni cerrar operaciones.

## Actualización 0.5 sin desvincular

Para una instalación existente, ejecutar `ACTUALIZAR-NODAL.cmd` y compilar
`NodalNinjaConnector` en NinjaTrader. No se pide código ni se reemplaza la
configuración o la cola cifrada. Se guarda respaldo del código anterior.

La versión 0.5 conserva las credenciales ante respuestas fallidas, incluso
un rechazo: sólo una nueva vinculación explícita las reemplaza. Distingue
renovación pendiente y autorización rechazada en NinjaScript Output.
La configuración se reemplaza atómicamente, con respaldo, después de cifrarla.
Las desconexiones de red no borran cuentas, operaciones ni credenciales.

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
desde NODAL. Se admite un conector activo por usuario y por identidad aprobada.
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
