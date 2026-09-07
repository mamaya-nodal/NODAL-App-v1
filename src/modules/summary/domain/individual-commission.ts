import type { OperationalSummary } from "./operational-summary";
import { portion } from "@/modules/admin/domain/desks";
/** Historical periods without an individual agreement keep their legacy rule. */
export function applyIndividualCommission(
  summary: OperationalSummary,
  bps: number | null,
): OperationalSummary {
  if (bps === null) return summary;
  const commission = portion(Math.max(0, summary.realizedGainInCents), bps);
  return {
    ...summary,
    commissionInCents: commission,
    commissionRateLabel: `${bps / 100}% · acuerdo individual`,
    traderGainInCents: Math.max(0, summary.realizedGainInCents) - commission,
  };
}
