import { describe, expect, it } from "vitest";

import type { NinjaAccountSnapshot } from "./ingestion-payload";
import { buildNinjaLiveBrokerBalance } from "./live-broker-balance";

function account(input: Partial<NinjaAccountSnapshot> & Pick<NinjaAccountSnapshot, "accountName">): NinjaAccountSnapshot {
  return {
    accountName: input.accountName,
    cashValue: input.cashValue ?? null,
    connectionName: input.connectionName ?? "Ninja",
    connectionStatus: input.connectionStatus ?? "Connected",
    netLiquidation: input.netLiquidation ?? null,
    providerName: input.providerName ?? "NinjaTrader",
    realizedProfitLoss: input.realizedProfitLoss ?? null,
    totalCashBalance: input.totalCashBalance ?? null,
    unrealizedProfitLoss: input.unrealizedProfitLoss ?? null,
  };
}

describe("live Ninja broker balance", () => {
  it("uses broker Cash Value while Net Liquidation is moving", () => {
    expect(buildNinjaLiveBrokerBalance([{
      accounts: [account({ accountName: "1850465", cashValue: 5_373.52, netLiquidation: 5_410 })],
      observed_at: "2026-09-09T12:33:40Z",
    }])).toEqual({
      balanceInCents: 537_352,
      observedAt: "2026-09-09T12:33:40Z",
      sourceAccounts: [{ accountName: "1850465", balanceInCents: 537_352, connectionName: "Ninja" }],
    });
  });

  it("excludes prop, simulator and disconnected accounts", () => {
    expect(buildNinjaLiveBrokerBalance([{
      accounts: [
        account({ accountName: "1850465", cashValue: 5_000 }),
        account({ accountName: "LFE05088021070001", cashValue: 50_000 }),
        account({ accountName: "Sim101", cashValue: 100_000 }),
        account({ accountName: "220022", cashValue: 7_000, connectionStatus: "Disconnected" }),
      ],
      observed_at: "2026-09-09T12:33:40Z",
    }])?.balanceInCents).toBe(500_000);
  });
});
