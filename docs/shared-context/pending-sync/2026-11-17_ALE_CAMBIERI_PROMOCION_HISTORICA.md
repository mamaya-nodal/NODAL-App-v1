# 17/11/2026 — Alejandro Cambieri, promoción bloqueada por falsa quema histórica

## Causa y alcance
Usuario fb1184da-8f37-4d85-abf1-46e2fb352fef, conector00ed1da0-6408-43e0-bd44-ba9204175b95, versión0.18 activa. Cinco LFE05096533610031–035 registradas13/11, precio12617centavos cadauna. OperaciónE1 13/11 abrió50000, mínimo48659.75, cerró51504.50. Alreprocesar el14/11 21:20:18UTC, se comparó ese mínimo con pisoposterior49504.50 (highestEOD51504.50) envezdepiso deldía48000. Falsaquema ya guardada cerró cuentas/vínculos; estadoquedóburned/reachedEvaluationTargetfalse. E2 16/11 cerró53009. NuevasLFF011–015 detectadas16/11 15:34:58UTC como nuevas, sinvínculo, debidoalfalsocierre anterior.

La corrección general d13e70e8, productivadesde16/11, evitaeldefectohaciaadelante pero NO saneóestadoshistóricos deotrosusuarios. ReparaciónparticulardeFranco se hizo; Alejandro quedóomitido. No atribuir elcasoav18 niaunareincidenciademostradadelalgoritmocorregido: fechadecreacióndelquema14/11 confirmada. Omisión de alcance en el saneamiento retroactivo.

## Correspondencia y reparación
Mauricio confirmó explícitamente031→011,032→012,033→013,034→014,035→015. Script scripts/repairs/2026-11-17-ale-false-burn-promotion.sql probadoenproducciónconROLLBACK, luegoconCOMMIT. Backup privado RLS private_ale_promotion_20261117.before_rows; auditoría ale_false_burn_promotion_20261117. Falsosburns deLFE marcadosdismissed; recuperadoelpasoFunded conmisma cuenta/compra/historial; avisosnewaccountLFFreemplazados; vidasderivadasLFEfalsamentequemadas retiradasdelestado, no telemetría.

Importante: 17/11 LFF perdieron2457/2467USD porcuenta, cash47706/47696 y mínimos47119.5–47389.5, por debajo delpiso48163. Esa quema actual SÍ tiene evidencia independiente y se conservó. Trigger dequema histórica cerrólosvínculosFundedrecuperadosal17/11 15:40:25.785639UTC, cuentasclosed. No reabrircuentasquemadasrealmentecomopartedelareparaciónvieja.

## Validación
Reproceso solicitado desde13/11 18UTC porcola persistente existente, sincreartrades/controlmanual. Job39622/completed39622, sinerror. Treslotes antesblockedpor5propnovinculadas quedaroncommitted:
- E2 16/11, lote5b387981-0695-4c62-82b1-6db01814bab9, resultado-105648c, control22 cb626dc3-fa1f-4d10-9c88-80f6562672df, saldo1010730→905082.
- Funded1 16/11, lote78b2434f-21e2-49d4-a761-9f9500303a12, -32700c, control23 b4f049de-4242-4f73-bb1e-fa5f201dfe83, saldo905082→872382.
- Funded2 17/11, lotecf0bf5fb-2db3-4f72-8698-f0a9fd699924,+254350c, control24 3ccf393f-3f8d-42e2-9d7d-d46d35f996e9,saldo872382→1126732.
Cada nuevocontroltiene5participantes/5cargas. Cadacuenta conserva compra12617 y4cargas totales: E1,E2,F1,F2. ConservadaE1 previamenteconciliada. VerificaciónSQL independiente; no se certificóUIpersonal. Evidencias outputs/alejandro-promotion-20261117.json, alejandro-promotion-sessions-20261117.json, alejandro-promotion-batches-20261117.json, alejandro-promotion-verified-20261117.json y capturaalejandro-promotion-fixed-20261117.jpg.

## Riesgo, rollback y Nodalito
Rollback requiere revertirconciliaciones nuevas enordeninverso medianteauditoría y luego vínculos/estadosdesdebackup, sin tocartelemetríaoriginal nipurchases. No restaurar unfalsocierreLFE nifundidasactualescomovivas accidentalmente.
Aprendizajegeneralizable: toda corrección de regla debe distinguir protecciónfutura y saneamientoretroactivo. Buscar cierresguardadosantesdeldespliegue; verificarfecha delmínimo vsdíadelpiso, cierredeltrade ypromociónposterior; no asumirqueunupdate reparalosestados. Mapearindividualmentesoloconfirmación/evidencia; conservar quemas reales posteriores. Reparación debe comprobarledger+cuentas+cargas+compras+estadocierre. RegistrodocumentalparaNodalito; no afirmar nueva herramienta/despliegue deagente.
Driveintegrado noaccesible (índice/estadovigente: MCPstartuphandshakeHTTPdecodingresponsebody), guardadopending-sync; no sincronizado. Pendientegeneral: inventariarotrosestadoshistóricosquequedaronmalantesdelarreglogeneral, sin reabrir/distribuir cuentasambiguas automáticamente.
