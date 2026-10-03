import type { OperationalOpeningSnapshot, OperationalSummary } from "./operational-summary";

export type AccountCarryover = Readonly<{
  accountState: "live" | "virgin";
  lifetimeResultInCents: number;
  purchasePriceInCents: number;
}>;

/** Opening evidence is frozen at the prior close, not recomputed from today's accounts. */
export function openingFromClosure(
  previous: OperationalSummary,
  carried: readonly AccountCarryover[],
  previousPeriodFeesInCents: number,
  history: OperationalOpeningSnapshot,
): OperationalOpeningSnapshot {
  const live = carried.filter((account) => account.accountState === "live");
  const virgin = carried.filter((account) => account.accountState === "virgin");
  const liveResult = live.reduce((total, account) => total + account.lifetimeResultInCents, 0);
  const virginPrice = virgin.reduce((total, account) => total + account.purchasePriceInCents, 0);
  const complete = live.length === previous.accountStates.live
    && virgin.length === previous.accountStates.virgin
    && virginPrice === previous.virginPriceInCents
    && (previous.resultDetails
      ? liveResult === previous.resultDetails.liveResultInCents
      : Math.abs(liveResult) === previous.floatingInCents);
  const closed = previous.resultDetails?.accumulatedClosedResultInCents
    ?? (history.accumulatedClosedResultInCents ?? 0) + previous.realizedGainInCents;
  const uncovered = previous.resultDetails?.accumulatedUncoveredResultInCents
    ?? (history.accumulatedUncoveredResultInCents ?? 0) + (previous.uncoveredBrokerResultInCents ?? 0);
  const fees = previous.resultDetails?.accumulatedFeesInCents
    ?? (history.accumulatedFeesInCents ?? 0) + previousPeriodFeesInCents;
  const adjustments = previous.resultDetails?.accumulatedAdjustmentsInCents
    ?? (history.accumulatedAdjustmentsInCents ?? 0) + (previous.priorPeriodResultAdjustmentInCents ?? 0);
  const hasHistory = previous.resultDetails?.accumulatedBreakdownAvailable
    ?? history.accumulatedBreakdownAvailable ?? false;
  const accumulatedMatches = !hasHistory
    || closed + liveResult - virginPrice + uncovered - fees + adjustments === previous.accumulatedResultInCents;
  return {
    brokerBalanceInCents: previous.brokerBalanceInCents,
    walletBalanceInCents: previous.walletBalanceInCents,
    fundingPendingInCents: previous.fundingPendingInCents,
    capitalNetInCents: previous.capitalNetInCents,
    accumulatedResultInCents: previous.accumulatedResultInCents,
    liveResultInCents: liveResult,
    virginPriceInCents: virginPrice,
    verified: complete && accumulatedMatches && history.verified !== false
      && previous.resultDetails?.verified !== false
      && previous.positionDifferenceInCents === 0
      && previous.realizedReconciliationDifferenceInCents === 0,
    accumulatedClosedResultInCents: closed,
    accumulatedUncoveredResultInCents: uncovered,
    accumulatedFeesInCents: fees,
    accumulatedAdjustmentsInCents: adjustments,
    accumulatedBreakdownAvailable: complete && hasHistory,
  };
}
