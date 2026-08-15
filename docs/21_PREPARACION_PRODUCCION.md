# Preparación para Producción

## Propósito

Este documento define qué debe estar listo antes de que NODAL App reciba datos reales. La publicación actual `nodal-app-preview` sigue siendo una demostración privada conectada a Desarrollo: no es Producción y no reemplaza Sheets.

## Protecciones ya incorporadas en la aplicación

- Cuando una pantalla falla, se muestra una recuperación clara sin exponer el detalle técnico ni alterar registros.
- `GET /api/health` confirma que el despliegue responde, sin revelar claves, URL de base de datos ni datos de alumnos. Un monitor externo podrá consultarlo.
- La aplicación no se indexa en buscadores.
- Se envían cabeceras que bloquean la inserción de la app en otros sitios, reducen referencias enviadas y desactivan cámara, micrófono y geolocalización.
- Las pruebas automáticas siguen cubriendo las reglas económicas y el recorrido funcional completo.

Estas medidas reducen riesgos, pero no sustituyen monitoreo, respaldos ni una revisión de seguridad.

## Ambientes obligatorios

| Ambiente | Finalidad | Datos permitidos | Proyecto Supabase | Despliegue Vercel |
|---|---|---|---|---|
| Local | Construcción y pruebas del equipo | Ficticios | Desarrollo | Equipo local |
| Preview | Demostraciones y validación privada | Ficticios o anonimizados | Desarrollo | `nodal-app-preview` |
| Producción | Operación de alumnos autorizados | Reales | Proyecto nuevo e independiente | Proyecto Vercel nuevo e independiente |

Cada ambiente tendrá sus propias variables de entorno. Nunca se copiarán secretos al repositorio ni se conectará Producción al proyecto de Desarrollo.

## Pasos externos antes del piloto real

1. Crear un proyecto Supabase de Producción separado, en la región acordada y con el plan que admita respaldo automático.
2. Aplicar las migraciones versionadas al proyecto nuevo, sin importar todavía datos reales.
3. Crear un proyecto Vercel de Producción con variables propias y dominio definitivo.
4. Crear una credencial Google OAuth exclusiva para el dominio de Producción y agregar únicamente sus URLs de retorno.
5. Configurar un servicio de monitoreo de errores y disponibilidad. Debe alertar a NODAL si falla la app o la ruta `/api/health`.
6. Acordar retención de respaldos, responsable y frecuencia de una copia independiente de la base. Un respaldo no se considera válido hasta restaurarlo en un proyecto de prueba separado y comprobar los datos.
7. Solicitar una revisión externa de seguridad: acceso, roles, políticas de base, OAuth, secretos y flujos de corrección económica.
8. Ejecutar el piloto en paralelo con Sheets y aprobar la conciliación antes de reemplazar el sistema actual.

## Respaldo y recuperación

- El respaldo automático del proveedor es una primera capa, no el único plan.
- La copia independiente deberá mantenerse con acceso restringido, fecha identificable y retención acordada.
- Una recuperación se ensaya siempre en una base de prueba nueva; nunca se restaura directamente sobre Producción para probar.
- Si se detecta un incidente, se congela la escritura afectada, se conserva evidencia, se comunica el alcance y se recupera solo con una decisión registrada.

## Pendientes que requieren decisión de NODAL

- Región y cuenta propietaria del proyecto de Producción.
- Presupuesto y plan de Supabase para respaldos.
- Servicio de monitoreo y destinatarios de alertas.
- Política de retención de respaldos y responsable de recuperaciones.
- Dominio final de la aplicación privada.
