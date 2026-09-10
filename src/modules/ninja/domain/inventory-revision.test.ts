import { describe, expect, it } from "vitest";

import type { NinjaAccountSnapshot } from "./ingestion-payload";
import { buildNinjaInventoryRevision } from "./inventory-revision";

function account(accountName: string, cashValue: number): NinjaAccountSnapshot {
  return {
    accountName,
    cashValue,
    connectionName: "Ninja Ivo",
    connectionStatus: "Connected",
    netLiquidation: cashValue,
    providerName: "NinjaTrader",
    realizedProfitLoss: 0,
    totalCashBalance: 0,
    unrealizedProfitLoss: 0,
  };
}

describe("Ninja inventory revision", () => {
  it("does not change for balance-only updates", () => {
    const before = buildNinjaInventoryRevision([{ accounts: [account("1850465", 10_000)], observed_at: "2026-09-10T10:00:00Z" }]);
    const after = buildNinjaInventoryRevision([{ accounts: [account("1850465", 10_250)], observed_at: "2026-09-10T10:00:01Z" }]);
    expect(after).toBe(before);
  });

  it("changes when an account appears or its connection state changes", () => {
    const initial = [{ accounts: [account("1850465", 10_000)], observed_at: "2026-09-10T10:00:00Z" }];
    const withProp = [{ accounts: [account("1850465", 10_000), account("LFF05071455150022", 50_000)], observed_at: "2026-09-10T10:00:01Z" }];
    const disconnected = [{ accounts: [{ ...account("1850465", 10_000), connectionStatus: "Disconnected" }], observed_at: "2026-09-10T10:00:02Z" }];
    expect(buildNinjaInventoryRevision(withProp)).not.toBe(buildNinjaInventoryRevision(initial));
    expect(buildNinjaInventoryRevision(disconnected)).not.toBe(buildNinjaInventoryRevision(initial));
  });

  it("is stable when NinjaTrader changes account order", () => {
    const broker = account("1850465", 10_000);
    const prop = account("LFF05071455150022", 50_000);
    expect(buildNinjaInventoryRevision([{ accounts: [broker, prop], observed_at: "a" }]))
      .toBe(buildNinjaInventoryRevision([{ accounts: [prop, broker], observed_at: "b" }]));
  });
});
