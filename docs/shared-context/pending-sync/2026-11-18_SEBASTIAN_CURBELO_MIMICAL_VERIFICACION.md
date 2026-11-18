# 2026-11-18 — Sebastián Curbelo, verificación MIMICAL

Síntoma reportado: mismo problema de envío que Juan Sánchez.

Evidencia de producción: la función create_identity_mimical_installation ya contiene la corrección general 20261118120000 (retiro de enlaces sent/sending, también vencidos). Sebastián tiene entitlement MIMICAL activo. Se ejecutó la preparación con su contexto de usuario para sus tres identidades: Valentino Alba, Milagros Rego y Agustín Tournoud; las tres devolvieron instalación correctamente. Transacción revertida íntegramente, sin correo adicional ni datos de prueba persistidos.

Además existe envío real para Valentino: creado 18/11 15:07:49 UTC, confirmado sent 15:07:53 UTC y downloaded 15:08:54 UTC (12:08:54 Buenos Aires), instalación 70708b8e-d441-4fe2-903a-d385b85f6c1e. Esto confirma que ese envío y descarga funcionaron; no prueba instalación en Ninja.

Conclusión: no se reprodujo un bloqueo actual de preparación para Sebastián. No atribuir un nuevo incidente al defecto anterior ni realizar modificaciones especulativas. Si persiste otro error, identificar identidad, texto y hora concretos para distinguir preparación, despacho, descarga e instalación. No afirmar un nuevo arreglo aplicado: se verificó la corrección general existente.

Rollback/riesgos: no se cambiaron datos ni código. Nodalito debe contrastar reportes con estados sent/downloaded y contexto temporal antes de diagnosticar una caída general o pedir reinstalación.

Drive pendiente: Estado e Índice no pudieron leerse mediante conector integrado por fallo de handshake HTTP (error decoding response body). Solicitar restablecer la conexión; no usar otra cuenta ni sustituir edición por navegador.
