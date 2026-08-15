import type { SummaryAlert } from "@/modules/summary/domain/summary-alerts";

export type DiagnosticStatus = "verified" | "probable" | "unresolved";

export type DiagnosticAnswer = Readonly<{
  cause: string;
  confidence: "high" | "medium" | "low";
  evidence: ReadonlyArray<Readonly<{ detail: string; label: string; type: string }>>;
  explainedDifferenceInCents: number;
  needsEscalation: boolean;
  recommendedAction: string;
  simulationResultInCents: number | null;
  status: DiagnosticStatus;
  summary: string;
}>;

export type AllocationComparison = Readonly<{
  accountLabel: string;
  allocatedInCents: number;
  controlNumber: number;
  differenceInCents: number;
  entryInCents: number | null;
  operatedOn: string;
  phase: string;
}>;

export type DiagnosticFacts = Readonly<{
  accountPhases: ReadonlyArray<Readonly<{
    accountLabel: string;
    phase: string;
    positiveInCents: number;
    negativeInCents: number;
    withdrawalInCents: number;
    totalGainInCents: number;
  }>>;
  alertCode: SummaryAlert["code"];
  alertDifferenceInCents: number;
  allocationComparisons: AllocationComparison[];
  exactDifferenceMatches: AllocationComparison[];
  recentActivity: ReadonlyArray<Readonly<Record<string, string | number | null>>>;
  summaryValues: Readonly<Record<string, number | null>>;
}>;

export function findAllocationComparisons(input: Readonly<{
  controls: ReadonlyArray<Readonly<{ id: string; number: number; operatedOn: string; phase: string | null }>>;
  entries: ReadonlyArray<Readonly<{ accountId: string; controlId: string; destination: "NETO BROKER +" | "NETO BROKER -" | "NONE"; magnitudeInCents: number }>>;
  labelsByAccountId: ReadonlyMap<string, string>;
  participants: ReadonlyArray<Readonly<{ accountId: string; allocatedInCents: number; controlId: string }>>;
}>): AllocationComparison[] {
  const controls = new Map(input.controls.map((control) => [control.id, control]));
  const entries = new Map(input.entries.map((entry) => [`${entry.controlId}:${entry.accountId}`, entry]));
  return input.participants.flatMap((participant) => {
    const control = controls.get(participant.controlId);
    if (!control) return [];
    const entry = entries.get(`${participant.controlId}:${participant.accountId}`);
    const entryInCents = entry
      ? entry.destination === "NETO BROKER +" ? entry.magnitudeInCents : entry.destination === "NETO BROKER -" ? -entry.magnitudeInCents : 0
      : null;
    const differenceInCents = entryInCents === null ? participant.allocatedInCents : entryInCents - participant.allocatedInCents;
    if (entryInCents !== null && differenceInCents === 0) return [];
    return [{
      accountLabel: input.labelsByAccountId.get(participant.accountId) ?? "Cuenta sin etiqueta",
      allocatedInCents: participant.allocatedInCents,
      controlNumber: control.number,
      differenceInCents,
      entryInCents,
      operatedOn: control.operatedOn,
      phase: control.phase ?? "Sin fase",
    }];
  });
}

export function shouldEscalateToTerra(input: Readonly<{
  answer: DiagnosticAnswer;
  facts: DiagnosticFacts;
}>): boolean {
  if (input.answer.needsEscalation || input.answer.status !== "verified") return true;
  if (input.facts.alertCode !== "capital_reconciliation_difference" && input.facts.alertCode !== "gain_reconciliation_difference") return false;
  return !(
    input.facts.exactDifferenceMatches.length > 0
    && Math.abs(input.answer.explainedDifferenceInCents) === Math.abs(input.facts.alertDifferenceInCents)
    && input.answer.simulationResultInCents === 0
  );
}

export function verifiedStatus(answer: DiagnosticAnswer, facts: DiagnosticFacts): DiagnosticStatus {
  if (answer.status !== "verified") return answer.status;
  if (facts.alertCode !== "capital_reconciliation_difference" && facts.alertCode !== "gain_reconciliation_difference") return "verified";
  return facts.exactDifferenceMatches.length > 0
    && Math.abs(answer.explainedDifferenceInCents) === Math.abs(facts.alertDifferenceInCents)
    && answer.simulationResultInCents === 0
    ? "verified"
    : "probable";
}
