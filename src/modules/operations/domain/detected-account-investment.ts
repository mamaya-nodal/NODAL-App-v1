type BrokerEntry = Readonly<{
  dailyControlId: string;
  destination: "NETO BROKER +" | "NETO BROKER -" | "NONE";
  magnitudeInCents: number;
}>;

function signedBrokerEntry(entry: BrokerEntry) {
  if (entry.destination === "NETO BROKER +") return entry.magnitudeInCents;
  if (entry.destination === "NETO BROKER -") return -entry.magnitudeInCents;
  return 0;
}

/**
 * Reconstruye el capital acumulado de una cuenta detectada sin duplicar los
 * controles automáticos. Los lotes Ninja aportan su asignación técnica; una
 * corrección manual sólo se suma cuando su control no pertenece a uno de esos
 * lotes.
 */
export function resolveDetectedAccountAccumulatedInCents(input: Readonly<{
  collectedPayoutsInCents: readonly number[];
  manualAndAutomaticEntries: readonly BrokerEntry[];
  purchaseCostInCents: number;
  technicalAllocationsInCents: readonly number[];
  technicalDailyControlIds: ReadonlySet<string>;
}>) {
  const technical = input.technicalAllocationsInCents.reduce((total, value) => total + value, 0);
  const manual = input.manualAndAutomaticEntries
    .filter((entry) => !input.technicalDailyControlIds.has(entry.dailyControlId))
    .reduce((total, entry) => total + signedBrokerEntry(entry), 0);
  const payouts = input.collectedPayoutsInCents.reduce((total, value) => total + value, 0);
  return -input.purchaseCostInCents + technical + manual + payouts;
}
