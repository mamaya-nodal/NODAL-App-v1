import { describe, expect, it } from "vitest";
import { buildConciliationBreakdown } from "./conciliation-breakdown";
import type { OperationalSummary } from "./operational-summary";

const summary: OperationalSummary = {
  accumulatedResultInCents: 20_000,
  accountStates: { virgin: 1, live: 1, closed: 1 }, brokerBalanceInCents: 100_000,
  capitalNetInCents: 80_000, commissionInCents: 0, commissionRateLabel: "Sin comisión", floatingInCents: 5_000,
  fundingCollectedInCents: 0, fundingPendingInCents: 2_000, fundingWithdrawals: [], manualAccountStateCount: 0,
  periodResultInCents: 20_000, positionDifferenceInCents: 0, positionExpectedInCents: 100_000,
  positionObservableInCents: 100_000, realizedGainInCents: 30_000, realizedReconciliationDifferenceInCents: 0,
  traderGainInCents: 30_000, virginPriceInCents: 5_000, walletBalanceInCents: -2_000, walletMovements: [],
};

describe("conciliation breakdown", () => {
  it("expone todos los componentes sin alterar los totales del resumen", () => {
    const breakdown = buildConciliationBreakdown(summary);
    expect(breakdown.capital.observable.reduce((total, line) => total + (line.valueInCents ?? 0), 0)).toBe(summary.positionObservableInCents);
    expect(breakdown.capital.expected.reduce((total, line) => total + (line.valueInCents ?? 0), 0)).toBe(summary.positionExpectedInCents);
    expect(breakdown.gains.reconstructed.reduce((total, line) => total + (line.valueInCents ?? 0), 0)).toBe(summary.realizedGainInCents);
  });
});
