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

## Pendiente para Google

La ruta de autenticacion ya esta programada, pero Google OAuth aun no esta
habilitado. Faltan un proyecto de Google Cloud propiedad de NODAL, pantalla de
consentimiento, Client ID, Client Secret y URLs de retorno. Esas credenciales
se configuraran en los paneles protegidos; nunca en archivos versionados.
