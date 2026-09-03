export type HomeDailyResult = Readonly<{
  operatedOn: string;
  resultInCents: number | null;
}>;

export type HomePerformance = Readonly<{
  averageInCents: number | null;
  bestInCents: number | null;
  worstInCents: number | null;
}>;

export type CapitalHistoryPoint = Readonly<{
  capitalInCents: number;
  periodMonth: string;
}>;

export type CapitalHistoryPeriod = Readonly<{
  id: string;
  periodMonth: string;
}>;

export type CapitalHistoryPurchase = Readonly<{
  fundsOrigin: "Aporte trader" | "Saldo generado";
  periodId: string;
  priceInCents: number;
}>;

export type CapitalHistoryControl = Readonly<{
  kind: "deposit" | "withdrawal" | "balance_update";
  movementInCents: number | null;
  originDestination: "Aporte trader" | "Saldo billetera" | "Retiro personal" | null;
  periodId: string;
}>;

export type CapitalHistoryWalletMovement = Readonly<{
  amountInCents: number;
  kind: "external_contribution" | "personal_withdrawal" | "prior_pending_collection";
  periodId: string;
}>;

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function buildHomePerformance(results: HomeDailyResult[]): HomePerformance {
  const byDay = new Map<string, number>();
  for (const result of results) {
    if (result.resultInCents === null) continue;
    byDay.set(result.operatedOn, (byDay.get(result.operatedOn) ?? 0) + result.resultInCents);
  }

  const dailyTotals = [...byDay.values()];
  if (dailyTotals.length === 0) {
    return { averageInCents: null, bestInCents: null, worstInCents: null };
  }

  return {
    averageInCents: Math.round(sum(dailyTotals) / dailyTotals.length),
    bestInCents: Math.max(...dailyTotals),
    worstInCents: Math.min(...dailyTotals),
  };
}

export function buildCapitalHistory(input: Readonly<{
  controls: CapitalHistoryControl[];
  periods: CapitalHistoryPeriod[];
  purchases: CapitalHistoryPurchase[];
  walletMovements: CapitalHistoryWalletMovement[];
}>): CapitalHistoryPoint[] {
  let accumulatedCapitalInCents = 0;

  return [...input.periods]
    .sort((left, right) => left.periodMonth.localeCompare(right.periodMonth))
    .map((period) => {
      const purchaseCapital = sum(
        input.purchases
          .filter((purchase) => purchase.periodId === period.id && purchase.fundsOrigin === "Aporte trader")
          .map((purchase) => purchase.priceInCents),
      );
      const brokerCapital = sum(
        input.controls
          .filter((control) => control.periodId === period.id)
          .map((control) => {
            if (control.kind === "deposit" && control.originDestination === "Aporte trader") {
              return control.movementInCents ?? 0;
            }
            if (control.kind === "withdrawal" && control.originDestination === "Retiro personal") {
              return -(control.movementInCents ?? 0);
            }
            return 0;
          }),
      );
      const walletCapital = sum(
        input.walletMovements
          .filter((movement) => movement.periodId === period.id)
          .map((movement) => movement.kind === "personal_withdrawal"
            ? -movement.amountInCents
            : movement.amountInCents),
      );

      accumulatedCapitalInCents += purchaseCapital + brokerCapital + walletCapital;
      return { capitalInCents: accumulatedCapitalInCents, periodMonth: period.periodMonth };
    });
}
