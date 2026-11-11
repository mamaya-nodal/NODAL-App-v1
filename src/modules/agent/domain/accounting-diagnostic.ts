import type { NodalitoFinding } from "./deterministic-audit";

type Control = Readonly<{
  balance_after_cents: number;
  balance_before_cents: number | null;
  control_number: number;
  id: string;
  operating_result_cents: number | null;
  period_id: string;
}>;

type Participant = Readonly<{
  account_id: string;
  allocated_result_cents: number;
  daily_control_id: string;
}>;

type Entry = Readonly<{
  account_id: string;
  daily_control_id: string;
  destination: "NETO BROKER +" | "NETO BROKER -" | "NONE";
  magnitude_cents: number;
}>;

type Batch = Readonly<{ daily_control_id: string | null; id: string }>;
type BatchMember = Readonly<{ account_id: string | null; batch_id: string; role: string }>;
type Link = Readonly<{
  account_id: string;
  accounting_phase: string | null;
  completed_trade_days: number | null;
  external_account_name: string;
  phase: string | null;
}>;
type AccountLinkState = Readonly<{
  account_id: string;
  account_state: string;
  closed_at: string | null;
  external_account_name: string;
}>;
type Session = Readonly<{
  account_name: string;
  connection_name: string;
  execution_count: number;
  id: number;
  opened_at: string;
}>;

type UnreconciledBatch = Readonly<{
  accounting_blocking_reason: string | null;
  accounting_period_id: string | null;
  accounting_status: string;
  id: string;
  opened_at: string;
  status: string;
}>;

type PendingBrokerEvent = Readonly<{
  connector_id: string;
  id: string;
  observed_at: string;
}>;

type PurchaseActivity = Readonly<{
  account_id: string;
  id: string;
  price_cents: number;
  purchased_on: string;
}>;

type DatedOperationEntry = Readonly<{
  account_id: string;
  operated_on: string;
}>;

const base = { userId: null, userName: null } as const;

function signedEntry(entry: Entry) {
  if (entry.destination === "NETO BROKER +") return Number(entry.magnitude_cents);
  if (entry.destination === "NETO BROKER -") return -Number(entry.magnitude_cents);
  return 0;
}

/** A late registration can duplicate a result if it was embedded in the price and later reconciled. */
export function diagnosePurchasesRegisteredAfterActivity(
  purchases: readonly PurchaseActivity[],
  entries: readonly DatedOperationEntry[],
): NodalitoFinding[] {
  const earliestOperationByAccount = new Map<string, string>();
  for (const entry of entries) {
    const current = earliestOperationByAccount.get(entry.account_id);
    if (!current || entry.operated_on < current) earliestOperationByAccount.set(entry.account_id, entry.operated_on);
  }
  return purchases.flatMap((purchase) => {
    const earliestOperation = earliestOperationByAccount.get(purchase.account_id);
    if (!earliestOperation || earliestOperation >= purchase.purchased_on) return [];
    return [{
      ...base,
      category: "billing" as const,
      detail: "La cuenta se registró después de su primera operación. Hay que confirmar que el precio cargado no incluya ese resultado, porque la conciliación lo contabiliza por separado.",
      evidence: `Compra ${purchase.id}; precio ${purchase.price_cents}; primera operación ${earliestOperation}; alta ${purchase.purchased_on}.`,
      id: `purchase-after-activity:${purchase.id}`,
      severity: "attention" as const,
      title: "Cuenta registrada después de operar",
    }];
  });
}

/** Detects broken broker continuity without inferring a missing movement. */
export function diagnoseBalanceChains(controls: readonly Control[]): NodalitoFinding[] {
  const byPeriod = new Map<string, Control[]>();
  for (const control of controls) byPeriod.set(control.period_id, [...(byPeriod.get(control.period_id) ?? []), control]);
  const findings: NodalitoFinding[] = [];
  for (const [periodId, rows] of byPeriod) {
    const ordered = [...rows].sort((left, right) => left.control_number - right.control_number);
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (current.balance_before_cents === null || Number(current.balance_before_cents) === Number(previous.balance_after_cents)) continue;
      findings.push({
        ...base,
        category: "billing",
        detail: "El saldo inicial de un registro no coincide con el saldo final del registro anterior. Esto puede encadenar mal el resultado y el flotante posterior.",
        evidence: `Período ${periodId}; controles ${previous.control_number} → ${current.control_number}; esperado ${previous.balance_after_cents}, registrado ${current.balance_before_cents}.`,
        id: `balance-chain:${periodId}:${current.id}`,
        severity: "critical",
        title: "Cadena de saldo broker interrumpida",
      });
    }
  }
  return findings;
}

/** Reconciles the economic control, its account allocation and the visible operation entry. */
export function diagnoseControlLedgers(
  controls: readonly Control[],
  participants: readonly Participant[],
  entries: readonly Entry[],
): NodalitoFinding[] {
  const findings: NodalitoFinding[] = [];
  const participantsByControl = new Map<string, Participant[]>();
  const entriesByControl = new Map<string, Entry[]>();
  for (const row of participants) participantsByControl.set(row.daily_control_id, [...(participantsByControl.get(row.daily_control_id) ?? []), row]);
  for (const row of entries) entriesByControl.set(row.daily_control_id, [...(entriesByControl.get(row.daily_control_id) ?? []), row]);
  for (const control of controls) {
    if (control.operating_result_cents === null) continue;
    const controlParticipants = participantsByControl.get(control.id) ?? [];
    const controlEntries = entriesByControl.get(control.id) ?? [];
    const allocated = controlParticipants.reduce((total, row) => total + Number(row.allocated_result_cents), 0);
    const allocationDifference = Math.abs(allocated - Number(control.operating_result_cents));
    // La distribución oficial redondea por cuenta. Un remanente de hasta un
    // centavo por participante no cambia el flotante y no es una anomalía.
    if (controlParticipants.length && allocationDifference > controlParticipants.length) {
      findings.push({
        ...base,
        category: "billing",
        detail: "El resultado broker del trade no coincide con lo distribuido entre sus cuentas. La facturación y el flotante por cuenta pueden quedar incompletos.",
        evidence: `Control ${control.id}; resultado ${control.operating_result_cents}; distribuido ${allocated}.`,
        id: `control-allocation:${control.id}`,
        severity: "critical",
        title: "Resultado distribuido de forma inconsistente",
      });
    }
    const participantsByAccount = new Map(controlParticipants.map((row) => [row.account_id, Number(row.allocated_result_cents)]));
    const entriesByAccount = new Map(controlEntries.map((row) => [row.account_id, signedEntry(row)]));
    const mismatched = new Set([...participantsByAccount.keys(), ...entriesByAccount.keys()]);
    const invalid = [...mismatched].filter((accountId) => participantsByAccount.get(accountId) !== entriesByAccount.get(accountId));
    if (invalid.length) {
      findings.push({
        ...base,
        category: "reconciliation",
        detail: "Las cuentas visibles en la operación no coinciden con la distribución contable del mismo trade.",
        evidence: `Control ${control.id}; ${invalid.length} cuenta(s) con diferencia: ${invalid.join(", ")}.`,
        id: `control-entries:${control.id}`,
        severity: "critical",
        title: "Operación y asientos por cuenta no coinciden",
      });
    }
  }
  return findings;
}

/** A committed batch must expose every explicit prop member in its economic control. */
export function diagnoseCommittedBatchCoverage(
  batches: readonly Batch[],
  members: readonly BatchMember[],
  entries: readonly Entry[],
): NodalitoFinding[] {
  const findings: NodalitoFinding[] = [];
  for (const batch of batches) {
    if (!batch.daily_control_id) continue;
    const expected = new Set(members.filter((row) => row.batch_id === batch.id && row.role === "prop" && row.account_id).map((row) => row.account_id!));
    const recorded = new Set(entries.filter((row) => row.daily_control_id === batch.daily_control_id).map((row) => row.account_id));
    const missing = [...expected].filter((accountId) => !recorded.has(accountId));
    if (!missing.length) continue;
    findings.push({
      ...base,
      category: "reconciliation",
      detail: "El conector cerró una cobertura con cuentas explícitas que no aparecen en la contabilidad del mismo trade. No se completa automáticamente porque hay que respetar únicamente las cuentas detectadas.",
      evidence: `Lote ${batch.id}; faltan ${missing.length}; control ${batch.daily_control_id}.`,
      id: `batch-coverage:${batch.id}`,
      severity: "critical",
      title: "Cobertura registrada con cuentas faltantes",
    });
  }
  return findings;
}

export function diagnoseOperationalBaselines(links: readonly Link[]): NodalitoFinding[] {
  const findings: NodalitoFinding[] = [];
  for (const link of links) {
    if (link.accounting_phase === null || link.completed_trade_days === null) {
      findings.push({
        ...base,
        category: "activity",
        detail: "La cuenta está vinculada al conector, pero no tiene definido el punto operativo desde el cual contar vuelta y día.",
        evidence: `Cuenta ${link.external_account_name}; vínculo contable incompleto.`,
        id: `account-baseline:${link.account_id}`,
        severity: "attention",
        title: "Cuenta sin vuelta y día de partida",
      });
      continue;
    }
    const incompatible = (link.phase === "Evaluation" && link.accounting_phase !== "Evaluacion")
      || ((link.phase === "Funded" || link.phase === "Live") && link.accounting_phase === "Evaluacion");
    if (incompatible) findings.push({
      ...base,
      category: "activity",
      detail: "El estado que transmite NinjaTrader no es compatible con la etapa contable usada para calcular la vuelta y el día.",
      evidence: `Cuenta ${link.external_account_name}; Ninja ${link.phase}; etapa ${link.accounting_phase}; base ${link.completed_trade_days}.`,
      id: `account-phase:${link.account_id}`,
      severity: "attention",
      title: "Etapa operativa y etapa contable no coinciden",
    });
  }
  return findings;
}

/** A closed NODAL account cannot keep receiving operations through an active link. */
export function diagnoseClosedAccountLinks(links: readonly AccountLinkState[]): NodalitoFinding[] {
  return links.filter((link) => link.account_state === "closed" && link.closed_at === null).map((link) => ({
    ...base,
    category: "reconciliation" as const,
    detail: "La cuenta está cerrada en NODAL, pero su vínculo Ninja sigue activo. Una operación posterior podría quedar sin cuenta válida o adjudicarse a una vida incorrecta.",
    evidence: `Cuenta ${link.external_account_name}; cuenta NODAL ${link.account_id}; vínculo sin fecha de cierre.`,
    id: `closed-account-active-link:${link.account_id}`,
    severity: "critical" as const,
    title: "Cuenta cerrada con vínculo Ninja activo",
  }));
}

/** Only linked prop sessions are considered; broker or unknown sessions are deliberately ignored. */
export function diagnoseUnbatchedLinkedSessions(
  sessions: readonly Session[],
  linkedSessionIds: ReadonlySet<number>,
): NodalitoFinding[] {
  return sessions.filter((session) => session.execution_count > 0 && !linkedSessionIds.has(session.id)).map((session) => ({
    ...base,
    category: "reconciliation" as const,
    detail: "NinjaTrader cerró una operación en una cuenta vinculada, pero esa sesión no quedó incorporada a ningún lote contable.",
    evidence: `${session.connection_name} · ${session.account_name}; sesión ${session.id}; apertura ${session.opened_at}; ejecuciones ${session.execution_count}.`,
    id: `unbatched-session:${session.id}`,
    severity: "critical" as const,
    title: "Operación cerrada sin lectura contable",
  }));
}

/** Un lote sin resolver sigue siendo evidencia aunque haya fallado la asignación de período. */
export function diagnoseUnreconciledBatches(
  batches: readonly UnreconciledBatch[],
  now = new Date(),
  minimumAgeMinutes = 15,
): NodalitoFinding[] {
  const nowMs = now.getTime();
  return batches.flatMap((batch) => {
    if (batch.accounting_status === "committed") return [];
    const openedAt = Date.parse(batch.opened_at);
    const ageMinutes = Number.isFinite(openedAt)
      ? Math.max(0, Math.floor((nowMs - openedAt) / 60_000))
      : minimumAgeMinutes;
    if (ageMinutes < minimumAgeMinutes) return [];
    const conflict = batch.status === "conflict" || batch.status === "unmatched";
    const missingPeriod = !batch.accounting_period_id;
    return [{
      ...base,
      category: "reconciliation" as const,
      detail: batch.accounting_blocking_reason
        || (missingPeriod
          ? "La operación fue detectada, pero no pudo asignarse a un período contable."
          : batch.accounting_status === "shadow_ready"
            ? "La conciliación quedó lista, pero no llegó a crear su registro contable."
            : "La operación tiene un bloqueo contable que requiere revisión."),
      evidence: `Lote ${batch.id}; apertura ${batch.opened_at}; ${missingPeriod ? "sin período asignado; " : ""}pendiente hace ${ageMinutes} minutos.`,
      id: `unreconciled:${batch.id}`,
      severity: conflict || missingPeriod ? "critical" as const : "attention" as const,
      title: missingPeriod
        ? "Operación detectada sin período contable"
        : batch.accounting_status === "shadow_ready"
          ? "Operación lista que no terminó de contabilizarse"
          : "Operación detectada sin conciliar",
    }];
  });
}

/** Agrupa lecturas de saldo pendientes para evitar una alerta por cada pulso. */
export function diagnosePendingBrokerEvents(
  events: readonly PendingBrokerEvent[],
  now = new Date(),
  minimumAgeMinutes = 15,
): NodalitoFinding[] {
  const byConnector = new Map<string, PendingBrokerEvent[]>();
  for (const event of events) {
    const observedAt = Date.parse(event.observed_at);
    if (Number.isFinite(observedAt) && now.getTime() - observedAt < minimumAgeMinutes * 60_000) continue;
    byConnector.set(event.connector_id, [...(byConnector.get(event.connector_id) ?? []), event]);
  }
  return [...byConnector.entries()].map(([connectorId, rows]) => {
    const ordered = [...rows].sort((left, right) => left.observed_at.localeCompare(right.observed_at));
    return {
      ...base,
      category: "reconciliation" as const,
      detail: `NODAL detectó ${rows.length} cambio${rows.length === 1 ? "" : "s"} de saldo broker sin una operación o transferencia registrada. Nodalito debe revisar, en este orden, si fue un depósito o retiro, un trade sin cobertura, una cuenta todavía no registrada o una operación que el conector no capturó.`,
      evidence: `Conector ${connectorId}; primera ${ordered[0].observed_at}; última ${ordered.at(-1)!.observed_at}.`,
      id: `pending-broker-events:${connectorId}`,
      severity: "attention" as const,
      title: "Cambio de saldo sin registrar",
    };
  });
}
