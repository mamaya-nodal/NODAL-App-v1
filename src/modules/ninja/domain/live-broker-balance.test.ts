import { describe, expect, it } from "vitest";

import type { NinjaAccountSnapshot } from "./ingestion-payload";
import { applyNinjaBrokerAccountAliases, buildNinjaLiveBrokerBalance } from "./live-broker-balance";

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

  it("sums several broker accounts without losing their individual balances", () => {
    const balance = buildNinjaLiveBrokerBalance([{
      accounts: [
        account({ accountName: "1850465", cashValue: 5_000 }),
        account({ accountName: "220022", cashValue: 7_350.25 }),
      ],
      observed_at: "2026-09-22T12:33:40Z",
    }]);

    expect(balance).toEqual({
      balanceInCents: 1_235_025,
      observedAt: "2026-09-22T12:33:40Z",
      sourceAccounts: [
        { accountName: "1850465", balanceInCents: 500_000, connectionName: "Ninja" },
        { accountName: "220022", balanceInCents: 735_025, connectionName: "Ninja" },
      ],
    });
  });

  it("does not duplicate the same broker account observed by two connectors", () => {
    const balance = buildNinjaLiveBrokerBalance([{
      accounts: [account({ accountName: "1850465", cashValue: 5_000 })],
      observed_at: "2026-09-22T12:30:00Z",
    }, {
      accounts: [account({ accountName: "1850465", cashValue: 5_125, connectionName: "Ninja remoto" })],
      observed_at: "2026-09-22T12:33:40Z",
    }]);

    expect(balance?.balanceInCents).toBe(512_500);
    expect(balance?.sourceAccounts).toHaveLength(1);
  });

  it("adds aliases without changing account identity or totals", () => {
    const balance = buildNinjaLiveBrokerBalance([{
      accounts: [account({ accountName: "1850465", cashValue: 5_000 })],
      observed_at: "2026-09-22T12:33:40Z",
    }]);

    expect(applyNinjaBrokerAccountAliases(balance, [{
      accountName: "1850465",
      connectionName: "Ninja",
      displayName: "Cobertura identidad Juli",
    }])).toEqual({
      balanceInCents: 500_000,
      observedAt: "2026-09-22T12:33:40Z",
      sourceAccounts: [{
        accountName: "1850465",
        balanceInCents: 500_000,
        connectionName: "Ninja",
        displayName: "Cobertura identidad Juli",
      }],
    });
  });
});
