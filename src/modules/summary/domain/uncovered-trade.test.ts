import { describe, expect, it } from "vitest";
import { buildOperationalSummary } from "./operational-summary";
import { buildConciliationBreakdown } from "./conciliation-breakdown";

describe("confirmed broker-only results", () => {
  it.each([1160, -1160, 0])("reconciles %i cents without attributing capital, props, payouts or commission", (result) => {
    const summary = buildOperationalSummary({
      accounts: [], entries: [], fundingWithdrawals: [], phaseWithdrawals: [], walletMovements: [],
      controls: [
        { controlNumber: 1, kind: "deposit", movementInCents: 483282, operatingResultInCents: null, originDestination: "Aporte trader", balanceAfterInCents: 483282 },
        { controlNumber: 2, kind: "balance_update", isUncovered: true, movementInCents: null, operatingResultInCents: result, originDestination: null, balanceAfterInCents: 483282 + result },
      ],
    });
    expect(summary.uncoveredBrokerResultInCents).toBe(result);
    expect(summary.periodResultInCents).toBe(result);
    expect(summary.capitalNetInCents).toBe(483282);
    expect(summary.realizedGainInCents).toBe(0);
    expect(summary.commissionInCents).toBe(0);
    expect(summary.positionDifferenceInCents).toBe(0);
    expect(summary.realizedReconciliationDifferenceInCents).toBe(0);
    expect(buildConciliationBreakdown(summary).gains.reconstructedTotal).toBe(result);
  });
});
