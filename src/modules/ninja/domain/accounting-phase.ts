import type { AutomaticAccountingMember } from "./automatic-accounting-projection";

type Phase = AutomaticAccountingMember["phase"];

/** Resolve the phase at the trade's time, never from a later trade or today's balance. */
export function resolveNinjaAccountingPhase(input: Readonly<{
  detectedPhase: "Evaluation" | "Funded" | "Live" | null;
  openedAt: string;
  fundedStartedAt: string | null;
  entries: readonly Readonly<{ phase: Phase; occurredAt: string }>[];
}>): Phase {
  if (input.detectedPhase === "Evaluation") return "Evaluacion";
  if (input.detectedPhase !== "Funded" && input.detectedPhase !== "Live") return null;
  const latest = [...input.entries]
    .filter((entry) => Date.parse(entry.occurredAt) <= Date.parse(input.openedAt))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0]?.phase;
  if (latest && latest !== "Evaluacion") return latest;
  return input.fundedStartedAt && Date.parse(input.fundedStartedAt) <= Date.parse(input.openedAt)
    ? "Primera vuelta" : null;
}
