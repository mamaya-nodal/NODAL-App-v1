# Preparación para Producción

## Propósito

Este documento define qué debe estar listo durante la migración inicial de
NODAL App. Desde el 4 de octubre de 2026, la aplicación productiva está
publicada en `https://app.nodaltrading.com` y continúa utilizando la base que ya
conservaba los historiales reales de Mauricio, Alfred y Sebastián. Sheets sigue
siendo la referencia durante la ejecución paralela y la conciliación.

La promoción en el lugar es una excepción controlada documentada en APP-143.
No autoriza a reiniciar historiales, trasladar conectores sin validación ni usar
la base productiva para pruebas destructivas.

## Protecciones ya incorporadas en la aplicación

- Cuando una pantalla falla, se muestra una recuperación clara sin exponer el detalle técnico ni alterar registros.
- `GET /api/health` confirma que el despliegue responde, sin revelar claves, URL de base de datos ni datos de alumnos. Un monitor externo podrá consultarlo.
- La aplicación no se indexa en buscadores.
- Se envían cabeceras que bloquean la inserción de la app en otros sitios, reducen referencias enviadas y desactivan cámara, micrófono y geolocalización.
- Las pruebas automáticas siguen cubriendo las reglas económicas y el recorrido funcional completo.

Estas medidas reducen riesgos, pero no sustituyen monitoreo, respaldos ni una revisión de seguridad.

## Estado actual de ambientes

| Ambiente | Finalidad | Datos permitidos | Proyecto Supabase | Despliegue Vercel |
|---|---|---|---|---|
| Local | Construcción y pruebas del equipo | Ficticios | Pendiente de separar | Equipo local |
| Preview | Validación privada no destructiva | Sin cargas de prueba hasta separar la base | Comparte temporalmente Producción | Proyecto Vercel actual |
| Producción | Operación de alumnos autorizados | Reales | Proyecto existente promovido | `app.nodaltrading.com` |

El objetivo permanente sigue siendo que cada ambiente tenga sus propias
variables y base. Hasta recuperar esa separación, Preview no se considera un
ambiente seguro para pruebas con escritura. Los secretos nunca se copian al
repositorio.

## Pasos externos antes del piloto real

1. **Completado:** publicar `app.nodaltrading.com`, configurar DNS y verificar
   `GET /api/health` con entorno `production`.
2. **Completado:** autorizar en Supabase el retorno OAuth del dominio definitivo
   y verificar que el inicio con Google vuelve a `/auth/callback` en ese dominio.
3. Recuperar un proyecto Supabase exclusivo de Desarrollo/Preview y aplicar allí
   las migraciones versionadas. Producción no se traslada para realizar esta
   separación.
4. Separar las variables de Vercel por ambiente; hasta entonces, Preview no se
   usa para pruebas destructivas ni para generar datos ficticios.
5. Configurar un servicio de monitoreo de errores y disponibilidad. Debe alertar a NODAL si falla la app o la ruta `/api/health`.
6. Acordar retención de respaldos, responsable y frecuencia de una copia independiente de la base. Un respaldo no se considera válido hasta restaurarlo en un proyecto de prueba separado y comprobar los datos.
7. Solicitar una revisión externa de seguridad: acceso, roles, políticas de base, OAuth, secretos y flujos de corrección económica.
8. Ejecutar el piloto en paralelo con Sheets y aprobar la conciliación antes de reemplazar el sistema actual.
9. Configurar en Google Workspace el alias de envío `noreply@nodaltrading.com`, el grupo colaborativo `contacto@nodaltrading.com` y una cuenta de servicio con delegación de dominio limitada al alcance `gmail.send`. Guardar la credencial exclusivamente como secreto del entorno y probar SPF, DKIM, DMARC, adjuntos PDF y trazabilidad del identificador de Gmail antes de habilitar entregas reales.

## Respaldo y recuperación

- El respaldo automático del proveedor es una primera capa, no el único plan.
- La copia independiente deberá mantenerse con acceso restringido, fecha identificable y retención acordada.
- Una recuperación se ensaya siempre en una base de prueba nueva; nunca se restaura directamente sobre Producción para probar.
- Si se detecta un incidente, se congela la escritura afectada, se conserva evidencia, se comunica el alcance y se recupera solo con una decisión registrada.

## Pendientes que requieren decisión de NODAL

- Proyecto y calendario para reconstruir Desarrollo/Preview sin afectar
  Producción.
- Retención efectiva de los respaldos del plan Supabase vigente.
- Servicio de monitoreo y destinatarios de alertas.
- Política de retención de respaldos y responsable de recuperaciones.
- Momento en que podrá retirarse el dominio anterior sin afectar conectores.
