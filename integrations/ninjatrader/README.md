# Conector NODAL para NinjaTrader

El conector es un complemento de solo lectura. Observa las conexiones, cuentas
y saldos disponibles en NinjaTrader y los envía a NODAL. No puede crear,
modificar ni cerrar operaciones.

## Vinculación

1. El alumno inicia sesión en NODAL y genera un código de ocho caracteres.
2. Ejecuta `NODAL-Ninja-Connector-setup.ps1` y pega ese código.
3. El instalador copia el complemento automáticamente; el alumno solo debe
   compilar `NodalNinjaConnector` en NinjaScript Editor.
4. El conector canjea el código una sola vez y guarda en Windows una credencial
   cifrada para ese usuario.

Después de vincularse, el conector continúa enviando aunque el alumno cierre la
web o salga de su sesión de Google. La credencial puede renovarse y revocarse
desde NODAL, y solo se admite un conector activo por alumno.

## Estado y seguridad

- Envía un latido cada 15 segundos.
- NODAL puede considerar desconectado el complemento cuando deja de recibirlo.
- Las conexiones nuevas quedan separadas hasta que un administrador las revise.
- No utiliza Machine ID, una clave universal ni credenciales del broker.
- El archivo local de credenciales queda protegido para el usuario de Windows
  que realizó la vinculación.

Durante una prueba local se usa `http://localhost:3000`. En producción debe
usarse exclusivamente la dirección HTTPS oficial de NODAL.
