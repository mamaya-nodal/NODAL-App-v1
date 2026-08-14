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
- bloqueo de nuevas cargas históricas fuera de secuencia; las correcciones de
  saldos existentes usan el flujo controlado con recálculo posterior.

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

## Corrección histórica de Control Diario

El `2026-08-12` se aplicó la migración
`20260812040000_correct_daily_control_balance.sql`. Agrega una función
transaccional disponible para usuarios autenticados y no para `anon`.

La corrección:

1. acepta únicamente un `balance_update` existente del período propio;
2. exige un saldo distinto y un motivo;
3. recalcula en orden todos los saldos, depósitos, retiros y resultados
   posteriores;
4. reescribe la distribución y la entrada de cada participante;
5. bloquea y revierte todo si una distribución deja de cerrar exactamente o un
   retiro supera el saldo recalculado;
6. conserva en auditoría instantáneas completas del antes y después.

La prueba funcional remota se ejecutó con `BEGIN` y `ROLLBACK` usando tres
cuentas. Además, una prueba visual temporal corrigió USD 5.600 a USD 5.500 y
confirmó USD 500 tanto en Control Diario como en Registro. Al finalizar se
eliminaron todos los datos técnicos y se verificaron cero compras, cuentas,
controles y entradas.

## Distribución excepcional por cuenta

El `2026-08-12` se aplicó la migración
`20260812050000_custom_daily_control_allocation.sql`. La distribución
igualitaria continúa siendo la opción normal. Cuando una ejecución real difiere
entre cuentas, el usuario puede habilitar el ajuste excepcional en la vista
previa, editar importes firmados y explicar el motivo.

El servidor confirma todo en una sola transacción y valida que:

1. estén incluidas exactamente la líder y las réplicas seleccionadas;
2. no haya cuentas repetidas y pertenezcan a la empresa y período elegidos;
3. exista una única líder;
4. la suma por cuenta coincida hasta el centavo con el resultado completo;
5. el motivo quede guardado junto con la distribución y la auditoría.

Una corrección histórica no puede convertir silenciosamente un reparto
excepcional en uno igualitario. La pantalla calcula los resultados posteriores,
muestra cada reparto excepcional afectado y exige confirmar sus nuevos importes
antes de guardar.

La verificación remota confirmó los 12 controles de permisos y seguridad. La
prueba funcional creó dentro de `BEGIN` un resultado de USD 500 distribuido en
USD 120, USD 200 y USD 180, verificó los registros derivados, la auditoría y el
bloqueo de sobrescritura implícita, y finalizó con `ROLLBACK`. No dejó datos de
prueba. El esquema remoto también pasó `db lint --linked` sin errores.

## Corrección de repartos excepcionales

El `2026-08-12` se aplicaron las migraciones
`20260812060000_correct_custom_daily_control_allocation.sql` y
`20260812061000_fix_custom_allocation_object_count.sql`. La segunda conserva
sincronizado el historial remoto después de corregir una incompatibilidad
detectada por la primera prueba; la transacción fallida se revirtió completa.

El flujo final:

1. recibe el saldo correcto y el motivo general;
2. recalcula la cadena cronológica sin guardar;
3. identifica todos los repartos excepcionales alcanzados;
4. propone aplicar la diferencia a la líder y permite editar cada cuenta;
5. valida cuentas, importes enteros en centavos y sumas exactas;
6. actualiza saldos, participantes, registros y auditoría en una sola
   transacción.

La prueba remota corrigió un resultado excepcional de USD 500 a USD 480 y lo
redistribuyó en USD 100, USD 200 y USD 180. También verificó el rechazo del
intento sin redistribución, 14 controles de permisos, auditoría completa y lint
sin errores. Finalizó con `ROLLBACK`; compras, cuentas, controles y registros
permanecieron en cero.

## Historial seguro de actividad del alumno

El `2026-08-14` se aplicaron las migraciones
`20260814000000_period_activity_history.sql` y
`20260814010000_fix_period_activity_original_amounts.sql`. Agregan una lectura
estable y acotada al período propio para construir la sección Actividad. La
segunda asegura que una confirmación conserve el importe que tenía al ocurrir,
aunque luego su saldo vigente haya sido corregido.

La función:

1. exige una sesión autenticada y acceso vigente al período solicitado;
2. incluye solamente compras, confirmaciones de Control Diario y correcciones;
3. devuelve campos preparados para la interfaz, no las instantáneas completas
   del antes y después;
4. mantiene revocado el acceso directo del alumno a `audit_events`;
5. ordena los eventos desde el más reciente y conserva el motivo de una
   corrección o distribución excepcional.

La migración quedó sincronizada con la base enlazada. Se ejecutaron 17 controles
SQL de permisos dentro de `BEGIN` y `ROLLBACK`, el lint remoto no encontró
errores y la base funcional permaneció vacía. La vista local verificó el enlace
de navegación y el estado sin actividad sin insertar datos económicos.
