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

export type CustomAllocation = EqualAllocation;

export function roundLikeSheets(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("El importe a redondear debe ser un número válido.");
  }
  return Math.sign(value) * Math.round(Math.abs(value));
}

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

export function parseSignedAmountToCents(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Cada resultado debe tener hasta dos decimales.");
  }
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  const signedCents = negative ? -cents : cents;
  assertIntegerCents(signedCents, "El resultado por cuenta");
  return signedCents;
}

export function validateCustomAllocation(
  totalInCents: number,
  allocations: CustomAllocation[],
): void {
  if (allocations.length === 0) {
    throw new Error("Debe existir al menos una cuenta participante.");
  }
  if (new Set(allocations.map((entry) => entry.accountId)).size !== allocations.length) {
    throw new Error("Una cuenta no puede participar más de una vez.");
  }
  if (allocations.filter((entry) => entry.role === "leader").length !== 1) {
    throw new Error("La distribución debe conservar una única cuenta líder.");
  }
  const validation = validateAllocationTotal(totalInCents, allocations);
  if (!validation.isValid) {
    throw new Error(
      `La distribución difiere del resultado total en ${validation.differenceInCents} centavos.`,
    );
  }
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

  // La planilla divide el total y redondea cada cuenta a dos decimales.
  const amountInCents = roundLikeSheets(totalInCents / participantIds.length);

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
