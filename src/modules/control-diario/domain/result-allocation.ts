export type AccountResult = {
  accountId: string;
  amountInCents: number;
};

export type BrokerEntry =
  | { destination: "NETO_BROKER_POSITIVE"; magnitudeInCents: number }
  | { destination: "NETO_BROKER_NEGATIVE"; magnitudeInCents: number }
  | { destination: "NONE"; magnitudeInCents: 0 };

export type EqualAllocation = {
  accountId: string;
  amountInCents: number;
  role: "leader" | "replica";
};

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

export function allocateResultEqually(
  totalInCents: number,
  leaderId: string,
  replicaIds: string[],
): EqualAllocation[] {
  assertIntegerCents(totalInCents, "El resultado total");

  if (!leaderId) {
    throw new Error("Debe elegirse una cuenta líder.");
  }

  const participantIds = [leaderId, ...replicaIds];

  if (new Set(participantIds).size !== participantIds.length) {
    throw new Error("Una cuenta no puede participar más de una vez.");
  }

  if (totalInCents % participantIds.length !== 0) {
    throw new Error(
      "El resultado no se divide en centavos exactos entre las cuentas elegidas.",
    );
  }

  const amountInCents = totalInCents / participantIds.length;

  return participantIds.map((accountId, index) => ({
    accountId,
    amountInCents,
    role: index === 0 ? "leader" : "replica",
  }));
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
