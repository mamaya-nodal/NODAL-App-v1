# Supabase de desarrollo

- Fecha de alta: `2026-08-11`
- Proyecto NODAL: `nodal-app-dev`
- Plan actual: gratuito
- Clasificacion NODAL: exclusivamente Desarrollo
- Region actual: East US (Ohio), `us-east-2`
- Datos reales permitidos: ninguno

## Estado verificado

La migracion `20260811000000_initial_identity_and_accounts.sql` fue aplicada a
la base de desarrollo mediante el editor SQL de Supabase.

La comprobacion posterior confirmo:

- siete tablas iniciales presentes;
- RLS activo en las siete tablas;
- catalogo limitado a `FFF`, `LUCID` y `TRADEFY`;
- una solicitud anonima a `companies` recibe HTTP `401` y no obtiene datos;
- la aplicacion local usa solo URL y clave publicable desde `.env.local`;
- ninguna clave administrativa se copio al repositorio.

## Aclaracion sobre el ambiente

El panel de Supabase llama `Production` a la rama principal de cada proyecto.
Eso no cambia su uso dentro de NODAL: este proyecto es una base descartable de
desarrollo y no recibira datos reales. Produccion tendra otro proyecto,
credenciales separadas y una region aprobada antes del piloto.

La region Ohio fue la opcion general asignada al crear esta base. Es aceptable
para pruebas sin usuarios reales. La region de Produccion sigue pendiente; se
evaluara Sao Paulo u otra region segun ubicacion de alumnos, normativa, costo y
servicios disponibles en ese momento.

## Historial de migraciones

El repositorio quedo vinculado al proyecto remoto
`bluxgbxpepnfnjczwjgh`. El `2026-08-11` se reparo el historial con
`migration repair` para registrar como aplicada la migracion inicial que se
habia ejecutado desde el panel.

La verificacion posterior confirmo:

- version local: `20260811000000`;
- version remota: `20260811000000`;
- `db push --dry-run`: base remota actualizada, sin migraciones pendientes.

Las migraciones posteriores deben crearse como archivos versionados y probarse
primero con `db push --dry-run`. No se deben ejecutar cambios manuales aislados
desde el panel.

Supabase CLI quedo autenticado localmente mediante un token personal de NODAL.
El token se almacena fuera del repositorio y no debe copiarse a archivos del
proyecto. Tiene vencimiento y debera renovarse cuando la herramienta lo indique.

En este equipo, Supabase CLI necesita un paquete local de certificados de
confianza de Windows para conectarse a la API. Ese archivo se genera dentro de
`supabase/.temp/`, esta ignorado por Git y no forma parte del producto.

## Google OAuth de desarrollo

El `2026-08-11` se completo la configuracion inicial de Google OAuth:

- proyecto Google Cloud: `NODAL App Development`;
- identificador del proyecto: `nodal-app-dev-505214`;
- aplicacion OAuth: `NODAL App`;
- audiencia externa en estado de prueba;
- cliente web: `NODAL App Development Web`;
- retorno de Google a Supabase:
  `https://bluxgbxpepnfnjczwjgh.supabase.co/auth/v1/callback`;
- retorno local autorizado en Supabase:
  `http://localhost:3000/auth/callback`;
- URL principal local: `http://localhost:3000`;
- proveedor Google habilitado en Supabase;
- un usuario NODAL autorizado como usuario de prueba en Google.

El Client Secret vive exclusivamente en los paneles protegidos de Google y
Supabase. No se copio al repositorio ni a `.env.local`.

La autenticacion y la autorizacion siguen separadas. Google puede verificar la
identidad de una persona, pero la aplicacion solo concede acceso operativo si
existe un registro activo y coincidente en `nodal_users`.

Antes de produccion se deberan configurar un ambiente, URLs y credenciales
separadas para el dominio definitivo. La configuracion actual es solo de
desarrollo y no admite datos reales.

## Prueba integral

El `2026-08-12` se verifico en la aplicacion local el recorrido completo:

1. inicio de sesion con el usuario Google de prueba;
2. retorno de Google a Supabase y de Supabase a NODAL App;
3. creacion de sesion valida;
4. lectura de autorizacion bajo RLS;
5. bloqueo intencional por ausencia de un registro activo en `nodal_users`;
6. cierre de sesion;
7. redireccion al inicio ante acceso directo posterior a `/app`.

La prueba confirma que identidad y autorizacion son controles independientes.
El siguiente paso no es abrir el acceso general, sino definir y probar el alta
administrativa del primer usuario autorizado de desarrollo.

## Autorizacion controlada

El `2026-08-12` se aplico la migracion
`20260812000000_controlled_user_authorization.sql` y se sincronizo su version
en el historial remoto de Supabase.

La migracion incorpora:

- una funcion privilegiada para autorizar un usuario que ya se identifico con
  Google;
- una funcion privilegiada para revocar su acceso;
- normalizacion del correo y rechazo de identidades inexistentes;
- motivo obligatorio para cada cambio;
- auditoria separada de altas y revocaciones;
- comportamiento idempotente cuando el estado solicitado ya esta vigente;
- RLS y ausencia de permisos directos para `anon` y `authenticated`;
- ejecucion reservada a `service_role` o al propietario de la base.

Se autorizo al responsable de NODAL como primer usuario del ambiente de
desarrollo, sin copiar su correo ni su identificador al repositorio. La prueba
posterior de Google OAuth mostro `Acceso autorizado` y estado `Habilitado`.

La verificacion remota de privilegios confirmo:

| Control | Resultado |
|---|---|
| `anon` puede autorizar | No. |
| `authenticated` puede autorizar | No. |
| `service_role` puede autorizar | Si. |
| RLS de la auditoria | Activo. |

Este mecanismo no decide todavia la matriz definitiva de roles administrativos.
Esa decision sigue abierta y no se reemplazo por un rol inventado.

## Espacios y periodo de desarrollo

El `2026-08-12` se aplico y registro la migracion
`20260812010000_provision_user_workspaces.sql`.

La funcion de provision inicial:

- acepta un usuario NODAL activo, un primer dia de mes y un motivo obligatorio;
- crea de forma idempotente sus espacios `Real` y `Practica`;
- crea el periodo indicado dentro de cada espacio;
- registra cuantos espacios y periodos fueron creados;
- solo puede ejecutarse mediante `service_role` o por el propietario de la base.

Para el primer usuario autorizado se crearon ambos espacios y un periodo de
desarrollo para agosto de 2026. No se guardaron su correo ni identificadores en
el repositorio. La interfaz local mostro el cambio entre ambas modalidades y
rechazo de forma segura un mes inexistente enviado por URL.

La verificacion remota de esta migracion confirmo:

| Control | Resultado |
|---|---|
| `anon` puede provisionar | No. |
| `authenticated` puede provisionar | No. |
| `service_role` puede provisionar | Si. |
| RLS de la auditoria | Activo. |
| Migracion registrada | Si. |

La seleccion mensual no abre ni cierra periodos. Ese procedimiento permanece
pendiente de definicion por Contabilidad y Gestion.

## Alta segura de compras

El `2026-08-12` se aplico la migracion
`20260812020000_create_purchase_transaction.sql` mediante Supabase CLI. El
historial local y remoto quedo sincronizado.

La funcion `create_nodal_purchase` ejecuta como una sola transaccion:

1. validacion de identidad, autorizacion y propiedad del periodo;
2. validacion de empresa vigente, precio y origen de fondos;
3. bloqueo transaccional del periodo para serializar consecutivos;
4. calculo de numero general y referencia independiente por empresa;
5. creacion de la cuenta con estado `virgin`;
6. creacion de la compra con fecha del servidor en Buenos Aires;
7. registro de auditoria.

Una falla revierte todos los pasos. El navegador no puede insertar directamente
en `accounts`, `purchases` ni `audit_events`.

La verificacion remota confirmo:

| Control | Resultado |
|---|---|
| `anon` puede ejecutar la compra | No. |
| `authenticated` puede llamar la funcion validada | Si. |
| `authenticated` puede insertar directamente en compras | No. |
| Migracion registrada | Si. |

No se creo una compra ficticia durante la prueba visual. Para confirmar la
operacion completa se usaran empresa, precio y origen decididos por el
responsable NODAL, sin inventar un registro economico.

## Transaccion inicial de Control Diario

El `2026-08-12` se aplico la migracion
`20260812030000_daily_control_transaction.sql`. El historial local y remoto
quedo sincronizado y `db lint --linked` no encontro errores de esquema.

La migracion incorpora:

- `daily_controls`, con saldo anterior y posterior, resultado, contexto,
  origen manual o NinjaTrader e idempotencia;
- `daily_control_participants`, con lider y replicas explicitas;
- `operation_entries`, con la entrada derivada por cuenta, fase, rol y destino;
- RLS de lectura por periodo propio y prohibicion de escritura directa;
- una funcion transaccional que valida, calcula, distribuye, guarda y audita
  todos los registros juntos;
- bloqueo de cargas historicas fuera de secuencia hasta implementar la
  correccion con recalculo posterior.

No se insertaron operaciones economicas para verificar la migracion. La
comprobacion realizada fue estructural y no destructiva: aplicacion
transaccional, sincronizacion del historial, `db push --dry-run` sin pendientes
y lint remoto sin errores. Las pruebas SQL de privilegios quedaron versionadas,
pero su ejecucion local sigue requiriendo Docker, que no esta instalado en este
equipo.

La prueba funcional se ejecuto directamente contra la base enlazada mediante
un archivo SQL encerrado en `BEGIN` y `ROLLBACK`. Verifico como una unica unidad:

1. deposito inicial de USD 5.000;
2. saldo NinjaTrader de USD 5.600;
3. resultado total de USD 600;
4. lider y dos replicas con USD 200 cada una;
5. tres entradas `NETO BROKER +`;
6. una auditoria por control;
7. repeticion del evento sin duplicacion;
8. rechazo de una division no exacta en centavos.

Al terminar, una consulta independiente confirmo cero periodos temporales y
cero controles con el identificador funcional utilizado. No se conservaron
datos economicos ni cuentas de prueba.
