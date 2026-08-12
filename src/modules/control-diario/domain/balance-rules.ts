export type DailyBalanceEntry =
  | { kind: "deposit"; amountInCents: number }
  | { kind: "withdrawal"; amountInCents: number }
  | { kind: "balance_update"; balanceInCents: number };

export type DailyBalanceResult = Readonly<{
  balanceInCents: number;
  operatingResultInCents: number | null;
}>;

export function parseControlAmountToCents(value: string): number {
  const normalized = value.trim().replace(",", ".");

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("El importe debe tener hasta dos decimales.");
  }

  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(cents)) {
    throw new Error("El importe indicado es demasiado grande.");
  }

  return cents;
}

function assertNonnegativeIntegerCents(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} debe ser un importe no negativo en centavos.`);
  }
}

function assertIntegerCents(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${fieldName} debe expresarse en centavos enteros.`);
  }
}

export function calculateDailyBalance(
  previousBalanceInCents: number | null,
  entry: DailyBalanceEntry,
): DailyBalanceResult {
  if (previousBalanceInCents !== null) {
    assertIntegerCents(previousBalanceInCents, "El saldo anterior");
  }

  if (entry.kind === "deposit") {
    assertNonnegativeIntegerCents(entry.amountInCents, "El depósito");

    return {
      balanceInCents: (previousBalanceInCents ?? 0) + entry.amountInCents,
      operatingResultInCents: null,
    };
  }

  if (entry.kind === "withdrawal") {
    assertNonnegativeIntegerCents(entry.amountInCents, "El retiro");

    if (previousBalanceInCents === null) {
      throw new Error("No se puede registrar un retiro sin saldo anterior.");
    }

    return {
      balanceInCents: previousBalanceInCents - entry.amountInCents,
      operatingResultInCents: null,
    };
  }

  assertIntegerCents(entry.balanceInCents, "El saldo actual");

  if (previousBalanceInCents === null) {
    throw new Error(
      "El primer saldo de referencia debe establecerse mediante un depósito.",
    );
  }

  return {
    balanceInCents: entry.balanceInCents,
    operatingResultInCents: entry.balanceInCents - previousBalanceInCents,
  };
}
