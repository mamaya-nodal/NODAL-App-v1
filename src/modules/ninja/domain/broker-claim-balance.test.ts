import { describe, expect, it } from "vitest";
import { buildBrokerBalanceAfterClaim, type ClaimedBrokerObservation } from "./broker-claim-balance";

const empty = { accounts: [], observed_at: "2026-10-08T12:29:48Z" };
function observation(accountName = "1850465", cashValue: number | null = 6982.04): ClaimedBrokerObservation {
  return { claimedAt: "2026-10-08T12:40:00Z", latestInventoryAt: empty.observed_at,
    sample: { kind: "balance", eventId: "received", accountName, connectionName: "Live", providerName: "Provider31",
      occurredAt: "2026-10-08T12:29:47Z", cashValue, netLiquidation: cashValue,
      totalCashBalance: 0, realizedProfitLoss: 0, unrealizedProfitLoss: 0 } };
}

describe("balance after explicit broker ownership confirmation", () => {
  it("uses both real received broker samples immediately after the claim, without resending inventory", () => {
    expect(buildBrokerBalanceAfterClaim([empty], [observation(), observation("2210006", 1363.48)]))
      .toEqual({ balanceInCents: 834552, observedAt: "2026-10-08T12:29:47Z", sourceAccounts: [
        { accountName: "1850465", balanceInCents: 698204, connectionName: "Live" },
        { accountName: "2210006", balanceInCents: 136348, connectionName: "Live" },
      ] });
  });
  it("does not count pending accounts until ownership is confirmed", () => {
    expect(buildBrokerBalanceAfterClaim([empty], [])).toBeNull();
  });
  it("a new empty inventory after claim prevents resurrection of disconnected accounts", () => {
    expect(buildBrokerBalanceAfterClaim([{ ...empty, observed_at: "2026-10-08T12:41:00Z" }], [
      { ...observation(), latestInventoryAt: "2026-10-08T12:41:00Z" },
    ])).toBeNull();
  });
  it("does not fabricate a missing cash balance or count simulator/prop receipts", () => {
    expect(buildBrokerBalanceAfterClaim([empty], [observation("1850465", null), observation("Sim101"), observation("LFE05088021070001")])).toBeNull();
  });
  it("a later normal inventory takes precedence and is not double-counted", () => {
    const sample = observation();
    expect(buildBrokerBalanceAfterClaim([{
      observed_at: "2026-10-08T12:41:00Z", accounts: [{ ...sample.sample, cashValue: 7000, connectionStatus: "Connected" }],
    }], [{ ...sample, latestInventoryAt: "2026-10-08T12:41:00Z" }])?.balanceInCents).toBe(700000);
  });
});
