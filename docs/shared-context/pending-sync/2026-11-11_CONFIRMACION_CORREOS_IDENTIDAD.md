# Confirmación visual de correos enviados desde identidades

Fecha: 2026-11-11  
Área: Nodal App (modificaciones)  
Alcance: envío de conector y MIMICAL desde tarjetas de identidad

## Necesidad

El usuario no recibía una confirmación breve y visible junto a la acción después de enviar por correo el conector o MIMICAL de una identidad.

## Cambio aplicado

- El envío del conector muestra `Correo enviado` dentro de la misma tarjeta de identidad.
- El envío de MIMICAL muestra `Correo enviado` dentro de la ventana Configuración de esa identidad.
- La confirmación sólo aparece después de que el servidor y la automatización de correo responden correctamente.
- Si el envío falla, se conserva el mensaje de error y nunca se muestra una confirmación falsa.

## Validación

- TypeScript sin errores.
- Pruebas de acciones de identidad y render de tarjetas aprobadas.

## Riesgo y rollback

Es un cambio visual y de estado local; no modifica destinatarios, enlaces ni vigencias. Rollback: retirar los estados locales de confirmación y volver a mostrar únicamente el mensaje general de la página.

## Impacto para Nodalito

Nodalito puede indicar que `Correo enviado` confirma la aceptación del envío por el servicio, no la apertura del mensaje por parte del destinatario.

## Sincronización pendiente

El conector integrado de Google Drive no estuvo disponible. Sincronizar este registro y actualizar `NODAL - Estado vigente` cuando se restablezca.
