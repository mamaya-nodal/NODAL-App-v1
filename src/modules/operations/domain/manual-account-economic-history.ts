export type ManualBalanceHistoryItem = Readonly<{
  cashValueInCents: number;
  initialBalanceInCents: number;
  tradeNumber: number;
}>;

export type ManualBrokerHistoryItem = Readonly<{
  brokerResultInCents: number;
  phase: string;
}>;

export type ManualEconomicHistoryItem = Readonly<{
  accumulatedInCents: number;
  brokerResultInCents: number | null;
  phase: string;
  propResultInCents: number | null;
  tradeNumber: number;
}>;

/**
 * Une los saldos prop informados manualmente con las coberturas contables ya
 * conciliadas. Las series se alinean desde el final porque una cuenta puede
 * tener trades prop previos cuya cobertura todavía no fue conciliada.
 */
export function buildManualAccountEconomicHistory(input: Readonly<{
  accumulatedInCents: number;
  balanceHistory: readonly ManualBalanceHistoryItem[];
  brokerHistory: readonly ManualBrokerHistoryItem[];
}>): ManualEconomicHistoryItem[] {
  const balances = [...input.balanceHistory].sort((left, right) => left.tradeNumber - right.tradeNumber);
  const brokers = [...input.brokerHistory];
  const rowCount = Math.max(balances.length, brokers.length);
  const balanceOffset = rowCount - balances.length;
  const brokerOffset = rowCount - brokers.length;
  let accumulated = input.accumulatedInCents;
  let priorCashValue: number | null = null;
  const rows: ManualEconomicHistoryItem[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const balance = balances[index - balanceOffset] ?? null;
    const broker = brokers[index - brokerOffset] ?? null;
    const propResult = balance
      ? balance.cashValueInCents - (priorCashValue ?? balance.initialBalanceInCents)
      : null;
    if (balance) priorCashValue = balance.cashValueInCents;
    if (broker) accumulated += broker.brokerResultInCents;
    rows.push({
      accumulatedInCents: accumulated,
      brokerResultInCents: broker?.brokerResultInCents ?? null,
      phase: broker?.phase ?? "Evaluacion",
      propResultInCents: propResult,
      tradeNumber: balance?.tradeNumber ?? index + 1,
    });
  }

  return rows;
}
