import { describe, expect, it } from "vitest";

import {
  getNinjaSnapshotSummary,
  isNinjaInventorySnapshot,
  normalizeNinjaInventorySnapshot,
} from "./ingestion-payload";

const snapshot = {
  accounts: [
    {
      accountName: "LFE05088021070001",
      cashValue: 50_000,
      connectionName: "Ninja Mauri",
      connectionStatus: "Connected",
      netLiquidation: 50_000,
      providerName: "Provider31",
      realizedProfitLoss: 0,
      totalCashBalance: 0,
      unrealizedProfitLoss: 0,
    },
  ],
  eventId: "event-1",
  kind: "inventory_snapshot",
  observedAt: "2026-08-26T14:14:25.000Z",
} as const;

describe("Ninja ingestion payload", () => {
  it("accepts a bounded inventory snapshot", () => {
    expect(isNinjaInventorySnapshot(snapshot)).toBe(true);
  });

  it("rejects malformed monetary values", () => {
    expect(
      isNinjaInventorySnapshot({
        ...snapshot,
        accounts: [{ ...snapshot.accounts[0], cashValue: "50000" }],
      }),
    ).toBe(false);
  });

  it("creates an allowlisted diagnostic summary without identifiers or balances", () => {
    expect(getNinjaSnapshotSummary(snapshot)).toEqual({
      accountCount: 1,
      connectionCount: 1,
    });
  });

  it("rejects invalid dates before account classification", () => {
    expect(isNinjaInventorySnapshot({ ...snapshot, observedAt: "not-a-date" })).toBe(false);
  });

  it("strips extra fields without changing contract values", () => {
    const extended = { ...snapshot, ownerUserId: "other-user",
      accounts: [{ ...snapshot.accounts[0], secret: "do-not-store" }],
    };
    expect(normalizeNinjaInventorySnapshot(extended)).toEqual(snapshot);
  });
});
