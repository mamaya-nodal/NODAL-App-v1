# 2026-11-18 — Sebastián Curbelo, verificación MIMICAL

Síntoma reportado: mismo problema de envío que Juan Sánchez.

Evidencia de producción: la función create_identity_mimical_installation ya contiene la corrección general 20261118120000 (retiro de enlaces sent/sending, también vencidos). Sebastián tiene entitlement MIMICAL activo. Se ejecutó la preparación con su contexto de usuario para sus tres identidades: Valentino Alba, Milagros Rego y Agustín Tournoud; las tres devolvieron instalación correctamente. Transacción revertida íntegramente, sin correo adicional ni datos de prueba persistidos.

Además existe envío real para Valentino: creado 18/11 15:07:49 UTC, confirmado sent 15:07:53 UTC y downloaded 15:08:54 UTC (12:08:54 Buenos Aires), instalación 70708b8e-d441-4fe2-903a-d385b85f6c1e. Esto confirma que ese envío y descarga funcionaron; no prueba instalación en Ninja.

Conclusión: no se reprodujo un bloqueo actual de preparación para Sebastián. No atribuir un nuevo incidente al defecto anterior ni realizar modificaciones especulativas. Si persiste otro error, identificar identidad, texto y hora concretos para distinguir preparación, despacho, descarga e instalación. No afirmar un nuevo arreglo aplicado: se verificó la corrección general existente.

Rollback/riesgos: no se cambiaron datos ni código. Nodalito debe contrastar reportes con estados sent/downloaded y contexto temporal antes de diagnosticar una caída general o pedir reinstalación.

## Aclaración posterior: fallo al activar, no al enviar

Mauricio confirmó que Sebastián intenta activar MIMICAL de una identidad. Sus últimos tres códigos del 18/11 (16:46:19, 16:46:37 y 16:47:38 UTC) fueron generados con entitlement personal, identity_id=null, y no se consumieron. Generar otro código personal invalida el anterior de ese mismo contexto. La licencia personal ya estaba vinculada y validó a las 16:54:18 UTC.

El cliente C# convierte cualquier respuesta HTTP 4xx en «El código es inválido, venció o ya fue utilizado». El servidor también rechaza con 401 el código personal usado en paquete identity, por lo cual el mensaje no prueba vencimiento. Es evidencia consistente de contexto equivocado; no hay registro histórico del HTTP de esos intentos para confirmar cada rechazo individual.

Validación adicional en producción, con rollback: código personal aceptado por paquete personal; mismo código rechazado por paquete identity sin consumirlo; código generado para Valentino aceptado por paquete identity. No se relajó separación de contextos, no se enviaron correos ni se persistieron licencias de prueba. Solución operativa: generar el código desde la configuración de la tarjeta de la identidad concreta. Mejora pendiente del cliente: distinguir contexto incompatible de vencimiento en el mensaje, sin distribuir otra versión solo por esta investigación.

Drive pendiente: Estado e Índice no pudieron leerse mediante conector integrado por fallo de handshake HTTP (error decoding response body). Solicitar restablecer la conexión; no usar otra cuenta ni sustituir edición por navegador.
