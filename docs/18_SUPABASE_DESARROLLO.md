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

El SQL remoto coincide con la migracion versionada, pero la tabla interna de
historial de Supabase CLI todavia no existe porque la primera aplicacion se hizo
desde el panel. Antes de aplicar una segunda migracion se debe:

1. autenticar Supabase CLI mediante un token personal de NODAL;
2. vincular el repositorio con el proyecto de desarrollo;
3. ejecutar `migration repair --status applied 20260811000000`;
4. comprobar con `migration list` que Local y Remote coinciden;
5. usar `db push --dry-run` antes de cada aplicacion posterior.

No se creara ni guardara ese token en Git. La herramienta local no puede usar
el acceso automatico en el entorno no interactivo de Codex, por lo que la
creacion del token requiere autorizacion explicita del propietario.

## Pendiente para Google

La ruta de autenticacion ya esta programada, pero Google OAuth aun no esta
habilitado. Faltan un proyecto de Google Cloud propiedad de NODAL, pantalla de
consentimiento, Client ID, Client Secret y URLs de retorno. Esas credenciales
se configuraran en los paneles protegidos; nunca en archivos versionados.
