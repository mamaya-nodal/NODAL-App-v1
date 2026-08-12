export type PhaseTotalsInput = Readonly<{
  brokerNegativeInCents: number;
  brokerPositiveInCents: number;
  withdrawalInCents: number;
}>;

export type PhaseTotals = Readonly<{
  carryToNextPhaseInCents: number;
  totalGainInCents: number;
}>;

function assertNonnegativeCents(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} debe ser un importe no negativo en centavos.`);
  }
}

export function calculatePhaseTotals(input: PhaseTotalsInput): PhaseTotals {
  assertNonnegativeCents(input.brokerPositiveInCents, "NETO BROKER +");
  assertNonnegativeCents(input.brokerNegativeInCents, "NETO BROKER -");
  assertNonnegativeCents(input.withdrawalInCents, "TOTAL RETIRO");

  const totalGainInCents =
    input.brokerPositiveInCents -
    input.brokerNegativeInCents +
    input.withdrawalInCents;

  return {
    carryToNextPhaseInCents: Math.max(-totalGainInCents, 0),
    totalGainInCents,
  };
}
