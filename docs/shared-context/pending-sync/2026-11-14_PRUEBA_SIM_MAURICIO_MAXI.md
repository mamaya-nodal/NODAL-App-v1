# Prueba autorizada SIM dentro del espacio real personal

Fecha 2026-11-14. Usuario autoriza ensuciar su contabilidad personal con SIM y limpiar después. No ejecutar órdenes reales. Admin Master se conserva.

## Contrato de prueba

Un solo broker con posibles subcuentas, nunca interpretar las identidades como brokers distintos. Titular e identidad observan cada cobertura completa en su propio Ninja. Ambas subcuentas detectadas deben ofrecer «Es mía» en la app del titular, aunque una observación llegue desde Maxi. No inventar que el Ninja personal ve una cuenta que no tiene conectada.

Whitelist temporal en temporary-simulation-scope.ts (14/11 20:45 UTC a 16/11 03:00 UTC):

- Conector personal 4f72f0d2-c11f-4d26-85f7-4116f656c94a: Simbroker = broker; Sim101 = Lucid Flex 50k Evaluation de prueba.
- Conector Maxi S ce4c4ef6-306f-4042-983f-85dae86b74ae, identidad 0bb58d74-905d-4eb5-9668-5d0f72e7b02f: SimSimbroker = otra subcuenta del mismo broker; Sim101 = otra prop de prueba.
- Ambos nombres broker son válidos desde cualquiera de las dos instalaciones autorizadas si están conectados allí. La fuente física no determina propiedad del saldo. Solo conexiones exactas Simulated Data Feed o Trasmision de datos simulados (espacios externos ignorados para whitelist).
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

858 pruebas completas aprobadas, TypeScript y build webpack aprobados. Primer despliegue 1c0bc63e147b verificado por /api/health a las 20:50:55 UTC, base OK 86 ms. Migración de whitespace aplicada y RPC claim_ninja_broker_account probada con conexión de espacio final y usuario real, exitosamente con rollback completo. Sin trades ejecutados por este chat. Falta nueva captura del inventario: el cliente evita reenviar un inventario idéntico, por lo que se necesita reconectar el feed o reiniciar Ninja para ver las nuevas cuentas admitidas.

Nodalito: diferenciar clasificación de prueba autorizada de cuentas reales. No extrapolar éxito SIM a latencias/ejecuciones reales. La confirmación de titular/subcuentas es independiente del origen físico de cobertura.

Drive integrado sigue fallando (MCP handshake / HTTP error decoding response body). Registro pendiente de sincronizar a mamaya@nodaltrading.com; no se usó otra cuenta.

Verificación final: producción fa86ad7427c7, 14/11 20:53:08 UTC, health/base OK (80 ms). Ambas subcuentas son admisibles desde cualquiera de los dos conectores autorizados. No había pendientes SIM materializados al cerrar la preparación; se pidió reiniciar los dos Ninja para capturar nuevo inventario. Esto NO certifica una operación ni una conciliación SIM. Backup 148373 filas/46 tablas y rol admin conservados. Captura outputs/sim-mauricio-maxi-respaldo-20261114.jpg. Falta confirmar subcuentas, preparar saldos iniciales/prop 50k y ejecutar primer trade por el usuario.

## Seguimiento: reinicio recibido y apertura reabierta

Tras reiniciar ambos Ninja, llegaron inventarios reales de la prueba: titular 20:59:08 UTC (Simbroker 9996400 centavos) y Maxi 21:00:18 UTC (SimSimbroker 10000000 centavos). Ambas observaciones están pendientes de claim, con destino personal del titular. Las prop Sim101 se conservaron en sus respectivos inventarios con proveniencia correcta. No hay controles nuevos en el período.

Usuario reportó que no reaparecía reconstrucción. Causa confirmada: apertura de 48400 centavos revisada/confirmada a las 20:10 UTC, autorización consumida; habilitar clasificación SIM no reabre edición. Se omitió reabrir el permiso al preparar la prueba. Corrección específica: nueva solicitud approved para la misma apertura, luego de bloquear/comprobar período propio abierto sin actividad. Se preservó la solicitud consumed anterior y se creó auditoría simulation_opening_revision_approved_20261114; no se borró ni confirmó apertura ni se cambió el saldo de 484.

Verificación UI real: al recargar /app aparece automáticamente diálogo «Empezá desde tu situación de hoy», Simbroker 99964 y SimSimbroker 100000, ambas con «Es mía» y «Descartar». Captura outputs/sim-inicio-reabierto-subcuentas-20261114.jpg. Queda al usuario confirmar subcuentas/guardar. Sim101 sigue con 105676.50 (personal) y 100000 (Maxi), pendiente restablecer a 50000 antes de probar reglas Lucid 50k y registrar las prop. No afirmar circuito E2E certificado.

Nodalito: cuando se prepara una nueva apertura de prueba sobre una cuenta que ya confirmó inicio, comprobar permiso vigente y visibilidad real del diálogo; no atribuir su ausencia a transmisión si las observaciones pendientes existen. Reiniciar Ninja no modifica autorizaciones de apertura.

## Preparación de las dos prop completada

Usuario confirmó ambas subcuentas y guardó apertura revisión 3 a las 21:05:52 UTC: broker/aporte 19996400 centavos, resto cero. No hay controles/trades de prueba.

Se intentó editar saldo de Sim101 local por UI, pero la automatización de teclado no reemplazó el importe. Se canceló explícitamente SIN guardar. Usuario restableció personalmente las dos Sim101 y avisó «listo». Telemetría/inventarios confirman 50000 en personal (21:09:36 UTC) y Maxi (21:10:14 UTC). No modificar saldos broker SIM.

El saldo anterior de las Sim101 (105676.50/100000) había dejado reachedEvaluationTarget=true y highestEodBalance alto. Se ejecutó scripts/repairs/2026-11-14-sim-prop-baseline.sql: solo recalcula las dos vidas Sim101 derivadas a saldo/highestEod 5000000 y target=false, después de verificar inventario 50000, ninguna sesión de prueba ni link registrado. Preserva IDs, otras vidas y toda la telemetría; auditoría sim101_starting_equity_reset_20261114. Piso de quema 4800000, fase Evaluation, último día completado 0.

Se registraron las dos prop mediante la UI normal de Cuentas, costo ficticio de ensayo 9030 centavos cada una, aporte trader, fecha 14/11, Evaluación, 0 días completados:
- titular: cuenta 047cff0e-11a1-4f8c-b57f-c72aa7284d89; identity_id null.
- Maxi: cuenta 8eab3f4d-882c-402d-a66b-cc5bb0615280; identity_id 0bb58d74-905d-4eb5-9668-5d0f72e7b02f.

Ambas virgin, links abiertos, fase Evaluation/Evaluacion, perfil lucid-flex-50k-2026-11-10 con target300000, maxloss200000, DLLsoft120000, EOD,50% y OnDemand. UI muestra ambas Sim101, cada una Cash value50000 y Evaluación Día1, total2 e invertido18060. No trades ni controles creados. life_id de link null según registro normal; no afirmar que se haya probado conciliación todavía.

## Defectos reproducidos durante la preparación

1. **Inventario por destino tapaba otras fuentes.** Consulta get_current_user_ninja_inventory tomaba una sola instantánea por connector_id. Observación concreta: lectura broker-only de Maxi de21:10 sustituía en pantalla a la lectura del titular de21:09 que contenía Sim101+Simbroker. Migración20261114222000 conserva último snapshot por destino/origen físico y reúne cuentas, eligiendo lectura más reciente de cada clave lógica. Mantiene dueño, conexiones aisladas, exclusiones, primer avistamiento y snapshots vacíos por origen. Índice nuevo. No modifica telemetría ni algoritmo de conciliación. Alcance: RPC de lectura del usuario; NO afirmar que todas las otras lecturas internas de latest inventory quedaron refactorizadas. Revisar por separado refreshNinjaTechnicalOperations, automatic-operation-processing y transición por origen si nuevas pruebas muestran problemas.
2. **Registro SIM no habilitado en SQL.** TS ya admitía la prueba, pero create_nodal_detected_purchase seguía rechazando Sim101 por clasificador puro de nombres. Migración20261114224000 habilita solo actor Mauricio, dos conectores exactos, Sim101, dos conexiones permitidas, ventana temporal, proveniencia estampada en inventario y empresa LUCID. Clasificadores puros permanecen sin SIM. La habilitación SQL también caduca16/11 03UTC.
3. **Espacio final de conexión impedía registrar/vincular.** Registro buscaba raw connectionName contra target trim y guard de aprobación comparaba etiqueta normalizada de reviews contra link raw. Se preserva el nombre observado en links para no romper comparación con ejecuciones, y se compara trim al localizar/autorizar. Migración20261114224500 conserva permisos y aislamiento; no añade conexiones aprobadas ni evita guard. Se reprodujeron rechazos antes y se comprobó RPC completa con rollback antes del registro definitivo por UI.

Validación adicional: scripts/test-ninja-inventory-origins.mjs, PGlite, 7 controles aprobados (no ocultamiento, dedupe, primer avistamiento, fuente vacía, aislamiento y exclusiones/propietario). Definiciones previas de las tres funciones guardadas en audit_events; migraciones asentadas en producción. Primer intento de parche SQL se revirtió por guard de ancla (indentación), sin mutación parcial. Prueba RPC de registro provisional se revirtió por completo. Registros definitivos se verificaron por UI y SQL, junto con perfil, dueño/identidad, días, estado y costo.

Pendiente inmediato: usuario abre/cierra cobertura SOLO SIM en su PC, Simbroker+Sim101, luego se verifica cadena completa antes de probar Maxi. Después retirar excepciones/limpiar datos de ensayo con respaldo. No hay certificación E2E todavía. Para Nodalito, distinguir hallazgo general confirmado de excepciones temporales de preparación SIM y no extrapolar causa a incidentes antiguos sin evidencia.

## Prueba interactiva realizada — 14/11/2026, 18:25–18:54 Argentina

Este seguimiento reemplaza el estado anterior «sin trades / falta prueba interactiva». Mauricio autorizó al agente a ejecutar las pruebas en ambas PC y exigió usar siempre MIMICAL. Solo se operó la líder Sim101; todas las patas broker fueron copiadas por MIMICAL, sin órdenes manuales en la seguidora y sin operaciones financieras reales.

**Regla aclarada por Mauricio:** la cuenta broker y sus subcuentas no se operan simultáneamente entre dos instalaciones de Ninja. Las pruebas son por turnos. Se descartó la propuesta de superponer PC1/PC2 y no se ejecutó ninguna cobertura simultánea entre instalaciones. El origen físico sigue siendo necesario para conservar el conjunto observado y distinguir registros demorados de instalaciones sucesivas; esto no implica operadores simultáneos.

Configuración observada: titular MIMICAL 1.1.0.9, Sim101 NQ DEC26 → Simbroker MNQ DEC26, ratio -1, Cross Order habilitado. Maxi MIMICAL 1.1.0.8, Sim101 NQ DEC26 → SimSimbroker NQ DEC26, ratio -1, Cross Order deshabilitado. Otros seguidores y trailing deshabilitados. No se instaló ni actualizó ningún complemento ni conector.

### Defecto general reproducido por el primer trade y corrección aplicada

La primera cobertura local generó ambas sesiones cerradas, pero la contabilización comparó el saldo de una subcuenta con el saldo contable total de dos subcuentas. `usesAggregateBrokerBalance` contaba brokers a partir de una sola instantánea por destino lógico. El fragmento broker de Maxi y el inventario local comparten destino personal: el último fragmento ocultaba la otra subcuenta al contador. No fue pérdida de ejecuciones ni un problema de copia de MIMICAL.

Corrección publicada en commit **3eadca87080d**: migración `20261114230000_ninja_latest_inventory_origin_view.sql` crea `ninja_latest_inventory_by_origin`, último inventario por destino y origen físico; vista security_invoker, acceso solo service_role. El lector de contabilización conserva cada origen antes de deduplicar cuentas económicas. Se eliminó su dependencia de las últimas 100 filas. No se cambió propiedad de las subcuentas, telemetría, importes ni ZIP.

Validación: regresión de dos subcuentas con un mismo destino y distintos orígenes; 301 pruebas Ninja, TypeScript y build webpack aprobados. Producción verificada por health a las 21:33:05 UTC, revisión 3eadca87080d, base OK. Se solicitó una reconstrucción auditada de la telemetría original de la primera cobertura; terminó committed. Las tres coberturas posteriores se contabilizaron automáticamente sin reparación de importes. Esto valida este defecto concreto; no identifica retroactivamente la causa del incidente histórico de Sebas.

Rollback: revertir el cambio del lector al commit anterior y revertir la vista únicamente tras retirar su consumo. No revertir ni borrar controles de clientes ni telemetría para deshacer código. Para el ensayo personal existe el respaldo privado ya indicado; su restauración sigue pendiente y debe ser acotada a Mauricio.

### Resultados observados

| Origen / prueba | Apertura broker UTC | Entradas líder | Resultado prop USD | Resultado broker USD | Lote |
| --- | --- | --- | ---: | ---: | --- |
| Titular 1 | 21:25:18.776478 | 1 contrato | +30.00 | -1.50 | 8fe76b33-6965-4bf9-ad7b-4c1c1c2ede50 |
| Maxi 1 | 21:34:54.218950 | 1 contrato | -5.00 | +5.00 | e7846134-477b-461d-be28-432acc048038 |
| Titular 2 | 21:43:11.525378 | 1 + 1, cierre de 2 | -85.00 | 0.00 | ec348d49-efc0-40bb-9ee7-24a3c919c08f |
| Maxi 2 | 21:52:42.542819 | 1 + 1, cierre de 2 | -70.00 | +60.00 | 07646adc-d8cf-4592-9909-40e00daf3f0a |

Las ocho sesiones quedaron closed; los cuatro lotes, committed con reason null. Miembros de titular: cuenta 047cff0e-11a1-4f8c-b57f-c72aa7284d89 y origen 4f72f0d2-c11f-4d26-85f7-4116f656c94a. Miembros Maxi: cuenta 8eab3f4d-882c-402d-a66b-cc5bb0615280 y origen ce4c4ef6-306f-4042-983f-85dae86b74ae. Ningún lote mezcló estas prop. Primera prueba: dos ejecuciones por sesión; segunda: tres ejecuciones por sesión, dos entradas y una salida de dos contratos.

Saldo broker final: Simbroker 99962.50 + SimSimbroker 100065.00 = **200027.50 USD**. Coincide con contabilidad: apertura 199964.00 + resultado 63.50. UI Operaciones: cuatro conciliaciones ordenadas por hora descendente, cero posiciones prop y «Sin operaciones activas». UI Cuentas: dos vivas, cero vírgenes, dos trades por cuenta; Sim101 titular cash49945.00, resultado contable -91.80; Maxi cash49925.00, resultado contable -25.30. Invertido total117.10 = compras180.60 - broker63.50. En la tabla desplegada de Maxi figuran compra90.30, cobertura+5 y cobertura+60; resultados prop -5/-70 conservados.

La UI mostró «Evaluación Día2» en ambas tras dos coberturas. Se documenta la observación; este ensayo de varios trades en una misma fecha no certifica reglas de días hábiles, espera24h, cambio de etapa ni quema.

### Reproceso sin duplicación

Después de los cuatro cierres se pidió reconstruir telemetría original desde21:24UTC para ambos conectores; auditorías `simulation_idempotence_requested_20261114`. Revisiones solicitadas/completadas: titular45992/45992 y Maxi48/48. Comparación JSON exacta antes/después de todas las filas del período en daily_controls, daily_control_participants y operation_entries: **idénticas**, cuatro filas en cada conjunto. No se agregaron ni modificaron controles manualmente para producir este resultado.

### Incidencias de observación y límites

La sesión remota presentó cambios de instrumento a APPJA y avisos de instrumento desconocido durante interacción de escritorio. Se restauró NQ y se verificó Sim101 antes de enviar las órdenes. Un aviso permanecía dibujado pero no impedía abrir la confirmación SIM, operar ni cerrar. No se atribuye esto al conector ni a MIMICAL: causa del aviso residual no demostrada. Tras cambios de ventana se necesitó esperar la actualización de imagen remota antes de verificar cada acción.

Al inspeccionar la app en una pestaña oculta aparecía el respaldo contable «Conciliación recuperada», sin detalle de ejecución. El componente pausa la consulta de telemetría mientras document.visibilityState es hidden. Al mostrar la pestaña se observaron las conciliaciones técnicas completas con broker, cantidades y horas. No se modificó código por ese artefacto de observación. La actualización de tarjetas contables tras nueva conciliación se verificó después de recargar la app.

Alcance validado: circuito SIM interactivo líder→MIMICAL→seguidora→recepción→reconstrucción→asociación por origen→contabilización→Operaciones/Cuentas, con una y dos entradas, desde ambas instalaciones por turnos. No certifica desconexión/reintentos offline, depósito durante posición, pérdida real de red, múltiples props por cobertura, reuse del mismo saldo broker exacto entre PC, payouts, cambio de etapa ni ejecución real de mercado. Las SIM broker representan dos subcuentas independientes y no una única cuenta compartida. No se afirma ausencia futura de todo error.

Evidencia local en `C:/Users/mauri/Documents/ChatGPT/NODAL APP/outputs/`: `sim-mauricio-maxi-evidence-20261114.json`, `sim-cuatro-conciliaciones-20261114.jpg`, `sim-cuentas-maxi-cargas-20261114.jpg`. Los datos ficticios permanecen para revisión; no se ha restaurado el libro ni retirado todavía la habilitación SIM temporal, que vence16/11 03UTC. No hubo posiciones SIM abiertas al verificar el cierre.

### Impacto para Nodalito y continuidad

Diagnóstico reutilizable: si existen sesiones cerradas y el resultado corresponde a una subcuenta, comprobar el inventario completo por origen antes de comparar con el ledger total; una lectura broker-only enrutada no reemplaza todo el inventario del titular. Separar falta de captura de un bloqueo contable por selección de saldo. Verificar simultáneamente lotes/miembros, control, participantes, cargas, saldo total y Cuentas. Reprocesar eventos originales y comparar el libro antes/después para probar idempotencia. Estas reglas quedan documentadas; no afirmar que las herramientas de Nodalito ya se hayan modificado por esta carga.

Pendientes entre áreas: sincronizar registro y Estado vigente cuando vuelva Drive; restaurar datos personales de ensayo y retirar excepción cuando Mauricio cierre las pruebas; mantener como limitación explícita los escenarios no ensayados. Drive integrado volvió a fallar al leer Estado vigente: MCP startup/handshake, HTTP request failed, error decoding response body. No se sustituyó por navegador, otra cuenta ni carga manual; este registro aún **no está sincronizado**.
