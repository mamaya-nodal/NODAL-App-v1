export type AccountAccountingState = "virgin" | "live" | "closed";
export type AccountStateOrigin = "automatic" | "manual_live" | "manual_closed";

export type AccountAccountingStateEvidence = Readonly<{
  hasOperationalData: boolean;
  phaseTotalGainInCents: ReadonlyArray<number | null>;
  stateOrigin?: AccountStateOrigin;
}>;

export function deriveAccountAccountingState(
  evidence: AccountAccountingStateEvidence,
): AccountAccountingState {
  for (const totalInCents of evidence.phaseTotalGainInCents) {
    if (totalInCents !== null && !Number.isSafeInteger(totalInCents)) {
      throw new Error("Cada TOTAL GANANCIA debe expresarse en centavos enteros.");
    }
  }

  if (evidence.stateOrigin === "manual_live") {
    return "live";
  }

  if (evidence.stateOrigin === "manual_closed") {
    return "closed";
  }

  if (evidence.phaseTotalGainInCents.some((total) => total !== null && total > 0)) {
    return "closed";
  }

  return evidence.hasOperationalData ? "live" : "virgin";
}
