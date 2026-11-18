# 2026-11-18 — Reenvío MIMICAL bloqueado por instalación vencida

Área: correcciones a clientes / MIMICAL / servidor. Alcance: Juan Sánchez, identidad Diego Lavezzary; regla general para todas las identidades.

Síntoma: «No se pudo preparar MIMICAL para esta identidad», antes de invocar el envío de correo.

Causa confirmada: la instalación 5d9e3c94-07ec-4b91-989f-b35240409410 se envió el 28/10 y venció el 29/10 sin descargar. Conservó status=sent. El índice único identity_mimical_installations_one_open incluye sent/sending sin considerar vencimiento. create_identity_mimical_installation retiraba únicamente enlaces aún vigentes; el nuevo INSERT chocaba con el anterior vencido.

Evidencia: función desplegada y fila original consultadas en producción bluxgbxpepnfnjczwjgh. RPC ejecutado con el contexto de Juan dentro de una transacción revertida: reprodujo unique_violation. No se llamó al servicio de correo.

Cambio aplicado: migración 20261118120000_identity_mimical_expired_resend.sql, aplicada y registrada en supabase_migrations.schema_migrations. Retira todos los enlaces anteriores sent/sending de esa identidad, vencidos o no. Mantiene bloqueo de fila de identidad, permisos, entitlement, validación de email, vigencia de tokens y auditoría. No borra historial ni cambia el ZIP, conector o MIMICAL instalado. El mismo defecto de conectores ya tenía su propia corrección en 20260930180000_identity_installation_expired_resend.sql; faltaba trasladarla a MIMICAL.

Validación: cuatro comprobaciones en la base real, todas true y con rollback íntegro: reenvío tras enlace vencido, reenvío tras enlace vigente, preservación del historial downloaded y rechazo de token nuevo vencido. Confirmada definición corregida tras COMMIT. No se envió correo real; falta que Juan pulse nuevamente «Enviar MIMICAL por correo» para verificar entrega.

Riesgos: no cambia proveedor de correo ni garantiza su entrega. Un reenvío invalida el enlace anterior, comportamiento ya previsto para enlaces vigentes.

Rollback: restaurar la definición original de create_identity_mimical_installation desde 20261028123000_identity_mimical_installations.sql. Las instalaciones retiradas conservan toda su trazabilidad. No se requiere restaurar datos de pruebas porque fueron revertidos.

Nodalito: ante error de preparación previo al envío, comprobar instalación sent/sending vencida y error de unicidad. Distinguir preparación de despacho y entrega. No pedir reinstalación ni alterar permisos si la causa es un enlace expirado. No afirmar correo enviado a partir de una prueba de RPC.

Drive: pendiente de sincronización. Las lecturas del Estado vigente y del Índice mediante el conector integrado fallaron por error de inicialización/handshake (HTTP error decoding response body). No se sustituyó por otra cuenta ni por edición desde navegador. Al restablecerlo, incorporar esta causa y corrección al Estado vigente/Índice y dejar entrega real como pendiente.
