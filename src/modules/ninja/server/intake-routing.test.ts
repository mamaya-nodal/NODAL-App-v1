import { describe, expect, it } from "vitest";

import type { NinjaAccountSnapshot } from "../domain/ingestion-payload";
import { inferFundedContinuationDestination } from "./intake-routing";

const funded: NinjaAccountSnapshot = {
  accountName: "FTDFYSLX50350058576",
  cashValue: 54_188.48,
  connectionName: "Tradeify Nati",
  connectionStatus: "Connected",
  netLiquidation: 54_188.48,
  providerName: "Tradovate",
  realizedProfitLoss: 4_188.48,
  totalCashBalance: 54_188.48,
  unrealizedProfitLoss: 0,
};

describe("Ninja continuation routing", () => {
  it("keeps a Tradeify Evaluation to Funded replacement in its existing ledger while paused", () => {
    expect(inferFundedContinuationDestination(funded, "2026-10-02T14:00:00Z", [
      { accountName: "TDFYSL50558089557", connectionName: "Tradeify Nati", destinationConnectorId: "nati", eligibleForFundedContinuation: true },
      { accountName: "TDFYSL50529077748", connectionName: "Tradeify Nati", destinationConnectorId: "nati", eligibleForFundedContinuation: true },
    ])).toBe("nati");
  });

  it("does not infer continuity when compatible evaluations belong to different ledgers", () => {
    expect(inferFundedContinuationDestination(funded, "2026-10-02T14:00:00Z", [
      { accountName: "TDFYSL50558089557", connectionName: "Tradeify Nati", destinationConnectorId: "nati", eligibleForFundedContinuation: true },
      { accountName: "TDFYSL50529077748", connectionName: "Tradeify Nati", destinationConnectorId: "other", eligibleForFundedContinuation: true },
    ])).toBeNull();
  });

  it("does not treat a new Evaluation account as a funded continuation", () => {
    expect(inferFundedContinuationDestination({ ...funded, accountName: "TDFYSL50558089557" },
      "2026-10-02T14:00:00Z", [
        { accountName: "TDFYSL50529077748", connectionName: "Tradeify Nati", destinationConnectorId: "nati", eligibleForFundedContinuation: true },
      ])).toBeNull();
  });

  it("requires the same Ninja connection", () => {
    expect(inferFundedContinuationDestination(funded, "2026-10-02T14:00:00Z", [
      { accountName: "TDFYSL50558089557", connectionName: "Another connection", destinationConnectorId: "nati", eligibleForFundedContinuation: true },
    ])).toBeNull();
  });

  it("does not reuse a historical evaluation after its transition opportunity ended", () => {
    expect(inferFundedContinuationDestination(funded, "2026-10-02T14:00:00Z", [
      { accountName: "TDFYSL50558089557", connectionName: "Tradeify Nati", destinationConnectorId: "nati", eligibleForFundedContinuation: false },
    ])).toBeNull();
  });
});
