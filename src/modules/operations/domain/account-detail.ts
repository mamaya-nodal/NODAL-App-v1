import {
  summarizeBrokerEntries,
  type BrokerRegisterSummary,
  type OperationRegisterEntry,
} from "./operation-register";

export const ACCOUNT_PHASES = [
  "Evaluacion",
  "Primera vuelta",
  "Segunda vuelta",
  "Tercera vuelta",
  "Cuarta vuelta",
  "Quinta vuelta",
] as const;

export type AccountActivitySummary = Readonly<{
  activePhaseCount: number;
  firstOperatedOn: string | null;
  lastOperatedOn: string | null;
  leaderEntryCount: number;
  replicaEntryCount: number;
}>;

export type AccountPhaseSummary = Readonly<{
  phase: (typeof ACCOUNT_PHASES)[number];
  broker: BrokerRegisterSummary;
}>;

export function summarizeAccountActivity(
  entries: OperationRegisterEntry[],
): AccountActivitySummary {
  const dates = entries.map((entry) => entry.operatedOn).sort();

  return {
    activePhaseCount: new Set(entries.map((entry) => entry.phase)).size,
    firstOperatedOn: dates[0] ?? null,
    lastOperatedOn: dates.at(-1) ?? null,
    leaderEntryCount: entries.filter((entry) => entry.participantRole === "leader")
      .length,
    replicaEntryCount: entries.filter((entry) => entry.participantRole === "replica")
      .length,
  };
}

export function summarizeAccountPhases(
  entries: OperationRegisterEntry[],
): AccountPhaseSummary[] {
  return ACCOUNT_PHASES.map((phase) => {
    const phaseEntries = entries.filter((entry) => entry.phase === phase);
    return { broker: summarizeBrokerEntries(phaseEntries), phase };
  });
}
