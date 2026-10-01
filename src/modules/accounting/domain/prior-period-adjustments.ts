import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";

export type PriorPeriodAdjustments = Readonly<{
  commissionInCents: number;
  resultInCents: number;
}>;

export function applyPriorPeriodAdjustments(
  summary: OperationalSummary,
  adjustments: PriorPeriodAdjustments,
): OperationalSummary {
  if (adjustments.resultInCents === 0 && adjustments.commissionInCents === 0) {
    return summary;
  }

  const positionExpectedInCents = summary.positionExpectedInCents + adjustments.resultInCents;

  return {
    ...summary,
    accumulatedResultInCents: summary.accumulatedResultInCents + adjustments.resultInCents,
    commissionInCents: summary.commissionInCents + adjustments.commissionInCents,
    positionDifferenceInCents: summary.positionObservableInCents - positionExpectedInCents,
    positionExpectedInCents,
    priorPeriodCommissionAdjustmentInCents: adjustments.commissionInCents,
    priorPeriodResultAdjustmentInCents: adjustments.resultInCents,
    traderGainInCents:
      summary.traderGainInCents + adjustments.resultInCents - adjustments.commissionInCents,
  };
}

