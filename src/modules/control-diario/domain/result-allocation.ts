export type AccountResult = {
  accountId: string;
  amountInCents: number;
};

export type BrokerEntry =
  | { destination: "NETO_BROKER_POSITIVE"; magnitudeInCents: number }
  | { destination: "NETO_BROKER_NEGATIVE"; magnitudeInCents: number }
  | { destination: "NONE"; magnitudeInCents: 0 };

function assertIntegerCents(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${fieldName} debe expresarse en centavos enteros.`);
  }
}

export function sumAccountResults(results: AccountResult[]): number {
  return results.reduce((sum, result) => {
    assertIntegerCents(result.amountInCents, "El resultado por cuenta");
    return sum + result.amountInCents;
  }, 0);
}

export function validateAllocationTotal(
  totalInCents: number,
  results: AccountResult[],
): { isValid: boolean; differenceInCents: number } {
  assertIntegerCents(totalInCents, "El resultado total");

  const distributedInCents = sumAccountResults(results);

  return {
    isValid: distributedInCents === totalInCents,
    differenceInCents: distributedInCents - totalInCents,
  };
}

export function toBrokerEntry(resultInCents: number): BrokerEntry {
  assertIntegerCents(resultInCents, "El resultado");

  if (resultInCents > 0) {
    return {
      destination: "NETO_BROKER_POSITIVE",
      magnitudeInCents: resultInCents,
    };
  }

  if (resultInCents < 0) {
    return {
      destination: "NETO_BROKER_NEGATIVE",
      magnitudeInCents: Math.abs(resultInCents),
    };
  }

  return { destination: "NONE", magnitudeInCents: 0 };
}
