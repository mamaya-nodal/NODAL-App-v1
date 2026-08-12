export type OperationRegisterEntry = Readonly<{
  accountId: string;
  accountReference: number;
  companyId: string;
  companyName: string;
  dailyControlId: string;
  destination: "NETO BROKER +" | "NETO BROKER -" | "NONE";
  id: string;
  magnitudeInCents: number;
  operatedOn: string;
  participantRole: "leader" | "replica";
  phase:
    | "Evaluacion"
    | "Primera vuelta"
    | "Segunda vuelta"
    | "Tercera vuelta"
    | "Cuarta vuelta"
    | "Quinta vuelta";
}>;

export type BrokerRegisterSummary = Readonly<{
  entryCount: number;
  negativeInCents: number;
  netInCents: number;
  positiveInCents: number;
}>;

export function entriesForAccount(
  entries: OperationRegisterEntry[],
  accountId: string,
): OperationRegisterEntry[] {
  return entries.filter((entry) => entry.accountId === accountId);
}

export function summarizeBrokerEntries(
  entries: OperationRegisterEntry[],
): BrokerRegisterSummary {
  const positiveInCents = entries
    .filter((entry) => entry.destination === "NETO BROKER +")
    .reduce((total, entry) => total + entry.magnitudeInCents, 0);
  const negativeInCents = entries
    .filter((entry) => entry.destination === "NETO BROKER -")
    .reduce((total, entry) => total + entry.magnitudeInCents, 0);

  return {
    entryCount: entries.length,
    negativeInCents,
    netInCents: positiveInCents - negativeInCents,
    positiveInCents,
  };
}
