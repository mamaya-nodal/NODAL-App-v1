# Prueba autorizada SIM dentro del espacio real personal

Fecha 2026-11-14. Usuario autoriza ensuciar su contabilidad personal con SIM y limpiar después. No ejecutar órdenes reales. Admin Master se conserva.

## Contrato de prueba

Un solo broker con posibles subcuentas, nunca interpretar las identidades como brokers distintos. Titular e identidad observan cada cobertura completa en su propio Ninja. Ambas subcuentas detectadas deben ofrecer «Es mía» en la app del titular, aunque una observación llegue desde Maxi. No inventar que el Ninja personal ve una cuenta que no tiene conectada.

Whitelist temporal en temporary-simulation-scope.ts (14/11 20:45 UTC a 16/11 03:00 UTC):

- Conector personal 4f72f0d2-c11f-4d26-85f7-4116f656c94a: Simbroker = broker; Sim101 = Lucid Flex 50k Evaluation de prueba.
- Conector Maxi S ce4c4ef6-306f-4042-983f-85dae86b74ae, identidad 0bb58d74-905d-4eb5-9668-5d0f72e7b02f: SimSimbroker = otra subcuenta del mismo broker; Sim101 = otra prop de prueba.
- Solo conexiones exactas Simulated Data Feed o Trasmision de datos simulados (espacios externos ignorados para whitelist).
- Cualquier otro usuario/conector/cuenta conserva exclusiones normales. No se cambian ZIP ni conector instalado.
- La normalización de entrada elimina nodalTestPhysicalConnectorId del cliente. Solo el servidor lo agrega tras autenticar el origen. Se conservan nombres, importes, payload/hash original y origen físico. La clasificación aprobada se conserva en el inventario y se recupera por el origen real para sesiones/claim. No hay conciliador alternativo.

Las dos SIM broker actuales son independientes, por lo que representan subcuentas distintas. NO prueban reutilización del mismo saldo económico en ambas PC; esa prueba exige coordinación explícita de los saldos. Sim101 llegó con 100k en Maxi y 105676.50 en titular: antes de simular Lucid 50k, restablecer esas prop a 50000 para no probar reglas contra capital incorrecto.

## Respaldo y limpieza

Ejecutado scripts/repairs/2026-11-14-mauricio-simulation-backup.sql. Esquema privado private_mauricio_sim_20261114.before_rows, RLS y sin permisos public/anon/authenticated. 148373 filas / 46 tablas. Baseline 2026-11-14T20:46:44.323944Z, previo al despliegue de admisión SIM. No usa created_by/actor_user_id como filtro, porque Mauricio administra usuarios ajenos.

No resetear todavía: usuario va a operar para validar. Al terminar: retirar whitelist; respaldar evidencia de prueba; restaurar solamente datos de Mauricio afectados, comparando baseline y auditoría; limpiar registros creados por esta prueba en orden de FK sin tocar clientes ni Admin Master. Mantener evidencia original de diagnóstico archivada fuera del libro activo. No afirmar que un backup equivale a un botón de reset ya implementado.

Apertura original del usuario confirmada 14/11 20:10 UTC: broker/aporte 48400 centavos, revisión 2; permiso anterior consumido. Antes de primer trade, comprobar confirmación de las dos subcuentas y ajustar punto de partida de prueba al saldo SIM total; no interpretar diferencia de capital SIM como ganancia.

## Hallazgo adicional

La conexión local trae espacio final. claim_ninja_broker_account comparaba connection_name sin trim contra target trim, impidiendo «Es mía» para esa observación. Migración 20261114215000 iguala btrim en búsqueda, sin renombrar la conexión persistida ni cambiar permisos/propiedad.

## Validación y estado

300 pruebas Ninja aprobadas, 18 específicas de claim/alcance aprobadas, TypeScript y build webpack aprobados antes del último pequeño ajuste de recuperación de claim (ajuste validado por sus pruebas y TypeScript). Publicación y recepción real deben verificarse antes de declarar listo. Sin trades ejecutados por este chat.

Nodalito: diferenciar clasificación de prueba autorizada de cuentas reales. No extrapolar éxito SIM a latencias/ejecuciones reales. La confirmación de titular/subcuentas es independiente del origen físico de cobertura.

Drive integrado sigue fallando (MCP handshake / HTTP error decoding response body). Registro pendiente de sincronizar a mamaya@nodaltrading.com; no se usó otra cuenta.
