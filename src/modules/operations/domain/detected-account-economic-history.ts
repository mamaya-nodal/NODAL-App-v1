export type DetectedTradeHistoryItem = Readonly<{
  brokerResultInCents: number;
  dailyControlId: string;
  openedAt: string;
  propResultInCents: number | null;
}>;

export type DetectedTradeAccountingEntry = Readonly<{
  dailyControlId: string;
  phase: string;
}>;

export type DetectedEconomicHistoryItem = Readonly<{
  accumulatedInCents: number;
  brokerResultInCents: number;
  phase: string;
  propResultInCents: number | null;
  tradeNumber: number;
}>;

/**
 * Construye una fila por control contable. La fecha no identifica un trade:
 * puede haber varias operaciones el mismo día y cada una conserva su etapa.
 */
export function buildDetectedAccountEconomicHistory(input: Readonly<{
  accumulatedInCents: number;
  accountingEntries: readonly DetectedTradeAccountingEntry[];
  baseline?: Readonly<{ completedTradeDays: number; phase: string }> | null;
  trades: readonly DetectedTradeHistoryItem[];
}>): DetectedEconomicHistoryItem[] {
  const phaseByControlId = new Map(
    input.accountingEntries.map((entry) => [entry.dailyControlId, entry.phase]),
  );
  let accumulated = input.accumulatedInCents;
  const phaseTradeCounts = new Map<string, number>();

  return [...input.trades]
    .sort((left, right) => left.openedAt.localeCompare(right.openedAt) || left.dailyControlId.localeCompare(right.dailyControlId))
    .map((trade, index) => {
      const phase = phaseByControlId.get(trade.dailyControlId) ?? "Evaluacion";
      const phaseTradeCount = (phaseTradeCounts.get(phase) ?? 0) + 1;
      phaseTradeCounts.set(phase, phaseTradeCount);
      accumulated += trade.brokerResultInCents;
      return {
        accumulatedInCents: accumulated,
        brokerResultInCents: trade.brokerResultInCents,
        phase,
        propResultInCents: trade.propResultInCents,
        tradeNumber: input.baseline
          ? (input.baseline.phase === phase ? input.baseline.completedTradeDays : 0) + phaseTradeCount
          : index + 1,
      };
    });
}
