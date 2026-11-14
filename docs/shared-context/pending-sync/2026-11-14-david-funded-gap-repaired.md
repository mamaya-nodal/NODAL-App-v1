# 2026-11-14 — David: dos operaciones Funded de Sebastian recuperadas
Área: correcciones a clientes / conciliación / Cuentas / Nodalito. Estado: aplicado y verificado en producción.

Síntoma: últimos controles conservaban saldo contable 9074.66 contra recibido 6228.66, diferencia 2846. Las reparaciones previas habían descartado correctamente el falso retiro de 2688.24 e identificado 420.80 de Sebastian, pero no habían reconstruido toda la cadena.

Causa contable confirmada: dos operaciones Funded de Sebastian no registradas, el 12/11 por -2425.20 y el 13/11 por -420.80. Ambas operaron las cinco Lucid LFF05092958280006–010, que conservan los mismos IDs de sus vidas Evaluation anteriores. Las tres operaciones Evaluation estaban asentadas; las dos Funded no. Llegaron inventarios y cambios de saldo/P&L, pero no sesiones de ejecución de esa identidad en esos intervalos. Esto no prueba una causa específica de la PC ni permite atribuirla a su versión actual.

Evidencia original: broker 2149906 el 12/11 pasa de 9307.36 / PnL 959.10 a 6882.16 / PnL -1466.10; cambio de efectivo y de PnL -2425.20. Las cinco props pasan de 50000 a 53193, PnL 3193 cada una. El 13/11 broker 6640.86 / PnL -241.30 pasa a 6220.06 / PnL -662.10: -420.80. Las cinco props pasan a 53356, PnL diario 163. Las dos pérdidas broker por cuenta son -485.04 y -84.16. No hay payout previo ni compra nueva; la compra original por cuenta es 84.40.

Cambio aplicado: dos controles con diez participantes y diez asientos, Primera vuelta. Control 21 recupera el 12/11 y control 24 el 13/11. Se renumeran los controles posteriores manteniendo sus IDs, resultados económicos, participantes y recibos originales. Secuencia final: control 20 9307.36; 21 6882.16; 22 6965.26; 23 6640.86 (trade descubierto original de -324.40 preservado); 24 6220.06; 25 6062.30; 26 6143.92; 27 6140.04; 28 6228.66. Diferencia final cero, sin forzar depósitos/retiros ni ajuste de capital.

Cuentas: las cinco permanecen vivas/Funded, Primera vuelta Día 2. Base Funded: Primera vuelta, cero días previos; los dos días se computan desde los dos asientos nuevos, evitando duplicarlos en la base. Compra original 84.40 conservada; costo/flotante acumulado por cuenta 913.58, incluido Evaluation y compra. Se cerraron cinco avisos account-baseline de esas cuentas. Otros avisos ajenos a este desfase no se marcaron resueltos sin investigarlos.

Validación: plan aritmético sobre copia original; primera ejecución completa en producción con rollback y todas las restricciones inmediatas aprobadas; luego commit real. Repetición del mismo script dejó resultado idéntico: dos controles recuperados, diez asientos, una auditoría, cero saltos, cero diferencias, cero transferencias broker-wallet nuevas. Se ejecutó validate_ninja_control_projection para todos los controles cubiertos del período. Payouts y compras preservados. No se fabricaron ejecuciones, posiciones o lotes técnicos.

Respaldo: private_david_gap_20261114.before_rows, RLS y permisos de cliente revocados. Auditoría: david_sebastian_funded_gap_repaired_20261114. Script: scripts/repairs/2026-11-14-david-funded-gap.sql; SHA256 2AF6F1BE9526DA0C05811C37AD31FEFCCEA5623AC564C0E5CCB2B4F416BB8777. Evidencias originales y comprobaciones privadas en client-audit-20261113/david-gap-20261114/, fuera del repositorio.

Rollback: sólo después de verificar que no haya cambios económicos posteriores dependientes; restaurar controles/links/estado/casos respaldados, retirar exclusivamente los dos controles y diez asientos identificados en la auditoría y validar toda la cadena en una transacción. No restaurar a ciegas copias de reparaciones anteriores ni borrar telemetría.

Nodalito: guía común actualizada. Regla: separar origen identificado de asiento efectivamente reparado; buscar operaciones Funded omitidas después de una promoción, reutilizando el vínculo histórico y sin duplicar compras. Contrastar cambio de saldo con PnL independiente y las cinco props; reconstruir en orden, verificar Cuentas y preservar un cero real de diferencia. No confundir pérdidas con transferencias. Una base de días debe excluir los trades ya asentados.

Sustituye el pendiente David -2846 de 2026-11-13_PENDING_FOUR_CLIENTS y la situación no cerrada del registro 2026-11-14-david-gap-clarification. No afirmar que ese residual sigue sin clasificar o sin corregir. El falso retiro de 2688.24 continúa descartado; no se recreó.

Drive: pendiente de sincronización porque el conector integrado sigue fallando; no se declara sincronizado. Al restablecerse, actualizar Estado vigente e Índice y conservar los registros anteriores como antecedentes.
