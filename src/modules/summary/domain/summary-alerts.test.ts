import { describe, expect, it } from "vitest";
import type { OperationalSummary } from "./operational-summary";
import { buildSummaryAlerts } from "./summary-alerts";

const baseSummary: OperationalSummary = {
  accumulatedResultInCents: 0,
  accountStates: { virgin: 0, live: 0, closed: 0 }, brokerBalanceInCents: 10_000,
  capitalNetInCents: 0, commissionInCents: 0, commissionRateLabel: "Sin comisión", floatingInCents: 0,
  fundingCollectedInCents: 0, fundingPendingInCents: 0, fundingWithdrawals: [], manualAccountStateCount: 0,
  periodResultInCents: 0, positionDifferenceInCents: 0, positionExpectedInCents: 10_000,
  positionObservableInCents: 10_000, realizedGainInCents: 0, realizedReconciliationDifferenceInCents: 0,
  traderGainInCents: 0, virginPriceInCents: 0, walletBalanceInCents: 0, walletMovements: [],
};

describe("summary alerts", () => {
  it("solo muestra alertas que nacen de un dato o conciliación concreta", () => {
    expect(buildSummaryAlerts(baseSummary)).toEqual([]);
    const alerts = buildSummaryAlerts({
      ...baseSummary, brokerBalanceInCents: null, manualAccountStateCount: 1,
      fundingWithdrawals: [{ id: "withdrawal", accountId: "account", amountInCents: 500, approvedOn: "2026-08-01", collectedOn: null }],
      positionDifferenceInCents: 20, realizedReconciliationDifferenceInCents: -10,
    });
    expect(alerts.map((alert) => alert.code)).toEqual([
      "missing_broker_balance", "capital_reconciliation_difference", "gain_reconciliation_difference",
      "pending_funding_withdrawal", "manual_account_state",
    ]);
  });
});
