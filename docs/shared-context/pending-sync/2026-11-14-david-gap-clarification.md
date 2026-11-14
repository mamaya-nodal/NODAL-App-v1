# 2026-11-14 — David: diferencia identificada no equivale a reparación terminada
Consulta de Mauricio: si los 2846 ya estaban aclarados. Revisión de código de reparación, documentos previos y base productiva actual, sin modificar registros.

Hechos: el falso movimiento broker->wallet de 2688.24 fue superseded sin crear transferencia. No confundirlo con el desfase contable de 2846. El control vigente 26 conserva contable 9074.66 y recibido 6228.66: diferencia 2846.

Descomposición histórica: 2425.20 ya preservados en control 21 (auditoría david_nov12_nov13_reconciliations_repaired), más 420.80 del movimiento de Sebastian identificado en el análisis anterior. La reparación posterior de tres trades mantuvo el desfase; auditoría client_review_20261113_david_three_trades. No se encontró una reparación posterior que lo absorba ni una clasificación económica completa de los 2425.20.

Corrección de comunicación: no presentar los 2846 íntegros como causa desconocida. Parte tiene origen identificado; identificación del origen y asiento reparado son estados diferentes. Tampoco decir que el falso retiro sigue pendiente.

Nodalito: separar pendiente técnico obsoleto, movimiento identificado sin contabilizar y residual todavía sin clasificar. Verificar libro actual antes de reabrir un caso resuelto.

No hubo cambio económico, rollback no aplica. Drive pendiente de sincronización; conector sigue fallando. Evidencia productiva consultada desde SQL Editor mediante sesión mamaya-nodal.

ACTUALIZACIÓN POSTERIOR — 14/11/2026: se identificaron y repararon las dos operaciones Funded omitidas de Sebastian (-2425.20 y -420.80). Saldo final contable/recibido 6228.66; diferencia cero. Ver 2026-11-14-david-funded-gap-repaired.md. Esta nota conserva únicamente el estado anterior a la reparación.
