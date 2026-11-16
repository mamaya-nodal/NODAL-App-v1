# 16/11/2026 — Detección general de diferencias broker sin inventarios duplicados

Área: App, conectores y Nodalito. Alcance: todos los usuarios.

Causa confirmada: el servidor exigía lecturas idénticas separadas por diez segundos dentro de treinta minutos; el conector suprime inventarios idénticos por fingerprint. En Franco, el aumento de US$ 4.975 llegó coherente el 16/11 a las 15:57:39 UTC, pero el duplicado llegó 59 minutos después. No fue una falta de recepción ni un fallo demostrado del conector de Edgardo.

Cambio aplicado en producción: migración 20261116190000. Una lectura original coherente y plana puede generar una revisión pendiente, conservando controles de origen, actualidad, corte contable, P&L y duplicados. No confirma depósitos ni mueve billeteras. Si una lectura posterior de P&L explica un candidato provisional, se marca reemplazado conservando evidencia; app, diagnóstico y confirmación excluyen esos avisos. No se reconstruyen movimientos históricos automáticamente. La propuesta anterior de esperar una verificación temporal queda reemplazada por este mecanismo de revisión sin asiento.

Validación: 875 pruebas aprobaron, incluyendo reproducción de Franco, campos desfasados, depósito durante trade, P&L normal, duplicados y fuentes inválidas. Typecheck y compilación aprobaron. La migración se ejecutó primero con rollback y después con commit; controles SQL productivos confirmados. Conector sin cambios.

Rollback: definiciones previas en private_broker_review_single_20261116.functions_before (acceso restringido). Revertir clientes de filtrado junto con funciones si se revierte el mecanismo; conservar evidencia de avisos reemplazados y no alterar movimientos confirmados.

Riesgos/límites: depende de recibir lecturas coherentes; el usuario confirma origen, fecha y comisión. Sin referencia reciente se presenta diferencia neutral, no se afirma depósito. Una posición abierta espera una lectura plana. Falta observar el próximo depósito real de extremo a extremo.

Nodalito: guía y corpus actualizados; diagnóstico omite revisiones explicadas por P&L. Diferenciar recepción, revisión pendiente y asiento confirmado. Evidencia privada: outputs/franco-promotion-20261116/deposit-detector-cause.json y broker-review-general-applied.jpg.

Drive: sincronización pendiente por el error de conexión previamente registrado; no se afirma sincronización.
