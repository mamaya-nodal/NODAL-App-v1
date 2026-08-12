export type AccountOperationalState = "virgin" | "live" | "closed";

export type AccountStateEvidence = Readonly<{
  hasOperationalData: boolean;
  phaseTotalGainInCents: ReadonlyArray<number | null>;
}>;

export function deriveAccountOperationalState(
  evidence: AccountStateEvidence,
): AccountOperationalState {
  for (const totalInCents of evidence.phaseTotalGainInCents) {
    if (totalInCents !== null && !Number.isSafeInteger(totalInCents)) {
      throw new Error("Cada TOTAL GANANCIA debe expresarse en centavos enteros.");
    }
  }

  if (evidence.phaseTotalGainInCents.some((total) => total !== null && total > 0)) {
    return "closed";
  }

  return evidence.hasOperationalData ? "live" : "virgin";
}
