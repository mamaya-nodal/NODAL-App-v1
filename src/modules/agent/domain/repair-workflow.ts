/** Shared policy for conversational reports and scheduled audits. No model output is executable SQL. */
export const incidentKinds = ["purchase_origin", "missing_account", "missing_operation", "coverage_members", "account_progress", "broker_transfer", "wallet_movement", "payout", "account_state", "connector", "billing"] as const;
export type IncidentKind = typeof incidentKinds[number];
export type RepairAction = "purchase_origin" | "approve_payout" | "collect_payout" | "wallet_movement" | "broker_transfer" | "coverage_members" | "correct_balance";
export type RepairState = "needs_information" | "needs_review" | "ready" | "applying" | "applied" | "failed" | "reverted";
export type RepairEvidence = Readonly<{
  ownerId: string;
  periodId: string;
  identityId: string | null;
  fingerprint: string;
  sourceIds: readonly string[];
  periodOpen: boolean;
  complete: boolean;
  ambiguous: boolean;
  hasSubsequentActivity: boolean;
  reconstructionVerified: boolean;
  invariants: readonly Readonly<{ name: string; passed: boolean }>[];
}>;
export type RepairDraft = Readonly<{
  incident: IncidentKind;
  action: RepairAction | null;
  evidence: RepairEvidence;
  missing: readonly string[];
  description: string;
}>;

export const incidentRequirements: Record<IncidentKind, readonly string[]> = {
  purchase_origin: ["Compras afectadas", "Origen real del pago", "Saldo y movimientos de la billetera"],
  missing_account: ["Identificador de cuenta", "Identidad y broker", "Fecha, precio y origen de compra", "Etapa inicial", "Actividad recibida"],
  missing_operation: ["Cuenta e identidad", "Fecha real", "Ejecuciones o saldos comprobables", "Participantes", "Cadena de saldos"],
  coverage_members: ["Operación", "Cuentas participantes", "Asignación exacta del resultado"],
  account_progress: ["Punto de partida", "Días operados sin duplicados", "Fases y payouts"],
  broker_transfer: ["Evento broker", "Billetera", "Fecha e importe acreditado", "Comisión", "Operaciones posteriores"],
  wallet_movement: ["Billetera", "Fecha", "Tipo de movimiento", "Importe y comisión"],
  payout: ["Cuenta y vuelta", "Importe aprobado", "Fecha de aprobación", "Cobro y destino si se acreditó"],
  account_state: ["Identificador real", "Actividad del ciclo", "Evidencia de cierre o quema"],
  connector: ["Instalación e identidad", "Última señal", "Versión ejecutada", "Telemetría recibida"],
  billing: ["Período", "Resultados realizados", "Payouts", "Distribución vigente", "Cierres"],
};

export function assessRepair(draft: RepairDraft, actorId: string): { state: RepairState; reasons: string[] } {
  const e = draft.evidence;
  if (e.ownerId !== actorId) return { state: "needs_review", reasons: ["La reparación pertenece a otro usuario."] };
  if (draft.missing.length || !e.complete || !e.sourceIds.length || !e.fingerprint) {
    return { state: "needs_information", reasons: draft.missing.length ? [...draft.missing] : ["Falta evidencia verificable."] };
  }
  const reasons: string[] = [];
  if (!e.periodOpen) reasons.push("La corrección afecta un período cerrado.");
  if (e.ambiguous) reasons.push("Hay más de una interpretación posible de los registros.");
  if (e.hasSubsequentActivity && !e.reconstructionVerified) reasons.push("La cadena posterior todavía no está verificada.");
  if (!e.invariants.length) reasons.push("Faltan controles de consistencia.");
  for (const check of e.invariants) if (!check.passed) reasons.push(check.name);
  if (!draft.action) reasons.push("Esta recuperación necesita intervención de Admin Master.");
  return { state: reasons.length ? "needs_review" : "ready", reasons };
}

const transitions: Record<RepairState, readonly RepairState[]> = {
  needs_information: ["needs_information", "needs_review", "ready"],
  needs_review: ["needs_information", "ready"],
  ready: ["applying", "needs_information", "needs_review"],
  applying: ["applied", "failed"],
  applied: ["reverted", "needs_review"],
  failed: ["needs_information", "needs_review", "ready"],
  reverted: [],
};

export function assertRepairTransition(from: RepairState, to: RepairState) {
  if (!transitions[from].includes(to)) throw new Error(`repair_transition_invalid:${from}:${to}`);
}

export function assertFreshRepair(expected: string, actual: string) {
  if (!expected || expected !== actual) throw new Error("repair_snapshot_changed");
}
