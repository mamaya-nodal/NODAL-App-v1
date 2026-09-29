export type HistoricalControl = Readonly<{
  isUncovered?: boolean;
  operatingResultInCents?: number | null;
  balanceAfterInCents: number;
  hasCustomAllocation?: boolean;
  id: string;
  kind: "deposit" | "withdrawal" | "balance_update";
  movementInCents: number | null;
  participantCount: number;
}>;

export type RecalculatedHistoricalControl = HistoricalControl &
  Readonly<{
    balanceBeforeInCents: number | null;
    operatingResultInCents: number | null;
  }>;

function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} debe ser un importe no negativo en centavos.`);
  }
}

export function recalculateAfterBalanceCorrection(
  controls: HistoricalControl[],
  targetControlId: string,
  correctedBalanceInCents: number,
): RecalculatedHistoricalControl[] {
  assertCents(correctedBalanceInCents, "El saldo corregido");
  const targetIndex = controls.findIndex((control) => control.id === targetControlId);
  if (targetIndex < 0 || controls[targetIndex].kind !== "balance_update") {
    throw new Error("Solo puede corregirse un nuevo saldo existente.");
  }
  if (controls[targetIndex].isUncovered) {
    throw new Error("El resultado confirmado sin cobertura conserva el importe recibido de NinjaTrader.");
  }

  let previousBalance: number | null = null;

  return controls.map((control, index) => {
    const balanceBeforeInCents = previousBalance;
    let balanceAfterInCents: number;
    let operatingResultInCents: number | null = null;

    if (control.kind === "deposit") {
      assertCents(control.movementInCents ?? -1, "El depósito");
      balanceAfterInCents = (previousBalance ?? 0) + (control.movementInCents ?? 0);
    } else if (control.kind === "withdrawal") {
      assertCents(control.movementInCents ?? -1, "El retiro");
      if (previousBalance === null || (control.movementInCents ?? 0) > previousBalance) {
        throw new Error("La corrección dejaría un retiro por encima del saldo disponible.");
      }
      balanceAfterInCents = previousBalance - (control.movementInCents ?? 0);
    } else if (control.isUncovered) {
      if (previousBalance === null || !Number.isSafeInteger(control.operatingResultInCents) || control.participantCount !== 0) {
        throw new Error("El trade sin cobertura no conserva un resultado válido.");
      }
      operatingResultInCents = control.operatingResultInCents!;
      balanceAfterInCents = previousBalance + operatingResultInCents;
      assertCents(balanceAfterInCents, "El saldo posterior");
    } else {
      if (previousBalance === null) {
        throw new Error("Un nuevo saldo requiere un saldo anterior.");
      }
      balanceAfterInCents = index === targetIndex
        ? correctedBalanceInCents
        : control.balanceAfterInCents;
      operatingResultInCents = balanceAfterInCents - previousBalance;
      if (control.participantCount < 1) {
        throw new Error("La operación debe conservar al menos una cuenta participante.");
      }
    }

    previousBalance = balanceAfterInCents;
    return {
      ...control,
      balanceAfterInCents,
      balanceBeforeInCents,
      operatingResultInCents,
    };
  });
}
