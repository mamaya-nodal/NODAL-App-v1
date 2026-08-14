# Preview privada en Vercel

## Estado

El `2026-08-14` se publicó la primera versión externa de prueba de NODAL App:

- proyecto Vercel: `nodal-app-preview`;
- dirección estable: `https://nodal-app-preview.vercel.app`;
- repositorio de origen: repositorio privado de NODAL App en GitHub;
- rama desplegada: `main`;
- datos: Supabase de desarrollo;
- acceso: identidad Google y autorización NODAL separadas.

## Alcance confirmado

Esta publicación permite revisar el recorrido real de la aplicación fuera de
la computadora local. La portada es visible por internet, pero el panel del
alumno exige una identidad Google válida y un acceso NODAL activo. Se verificó
el regreso correcto desde Google hasta el panel privado.

La preview:

1. no es producción;
2. no contiene datos reales de alumnos;
3. no reemplaza Sheets;
4. utiliza solamente la base de desarrollo;
5. se actualiza desde los cambios revisados y enviados a `main`;
6. mantiene separados el acceso público a la portada y el acceso autorizado al
   espacio privado.

## Configuración de autenticación

Supabase conserva el retorno local para desarrollo y admite también la
dirección estable de la preview y las direcciones temporales generadas por
Vercel. No se guardan claves ni credenciales en este documento ni en el
repositorio.

## Pendiente antes de producción

La futura producción deberá crearse como un entorno separado, con su propia
configuración, revisión de seguridad, estrategia de respaldo, monitoreo y
aprobación funcional. La existencia de esta preview no autoriza datos reales ni
acceso general de alumnos.
