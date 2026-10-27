import type { AutomaticAccountingMember } from "./automatic-accounting-projection";
import { advancePhaseThroughApprovedPayouts } from "@/modules/operations/domain/account-progress";

type Phase = AutomaticAccountingMember["phase"];

/** Resolve the phase at the trade's time, never from a later trade or today's balance. */
export function resolveNinjaAccountingPhase(input: Readonly<{
  detectedPhase: "Evaluation" | "Funded" | "Live" | null;
  baseline?: Readonly<{ phase: Exclude<Phase, null>; effectiveAt: string }> | null;
  openedAt: string;
  fundedStartedAt: string | null;
  entries: readonly Readonly<{ phase: Phase; occurredAt: string }>[];
  payouts?: readonly Readonly<{ phase: Exclude<Phase, "Evaluacion" | null>; occurredAt: string }>[];
}>): Phase {
  if (input.detectedPhase === "Evaluation") return "Evaluacion";
  if (input.detectedPhase !== "Funded" && input.detectedPhase !== "Live") return null;
  const latest = [...input.entries]
    .filter((entry) => Date.parse(entry.occurredAt) <= Date.parse(input.openedAt))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0]?.phase;
  const baselinePhase = input.baseline && Date.parse(input.baseline.effectiveAt) <= Date.parse(input.openedAt)
    ? input.baseline.phase
    : null;
  const fundedPhase = latest && latest !== "Evaluacion"
    ? latest
    : baselinePhase && baselinePhase !== "Evaluacion"
      ? baselinePhase
    : input.fundedStartedAt && Date.parse(input.fundedStartedAt) <= Date.parse(input.openedAt)
      ? "Primera vuelta"
      : null;
  if (!fundedPhase) return null;
  return advancePhaseThroughApprovedPayouts(
    fundedPhase,
    (input.payouts ?? [])
      .filter((payout) => Date.parse(payout.occurredAt) <= Date.parse(input.openedAt))
      .map((payout) => ({ phase: payout.phase })),
  );
}
