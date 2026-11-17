import { describe, expect, it } from "vitest";
import type { NinjaTelemetryRow } from "./operation-probe";
import { buildNinjaTechnicalOperations } from "./technical-operation";

const at = (time: string) => `2026-11-17T${time}Z`;
const row = (id: number, type: NinjaTelemetryRow["event_type"], time: string, payload: Record<string, unknown>): NinjaTelemetryRow => ({
  id, event_type: type, occurred_at: at(time), payload, instrument: type === "balance" ? null : "NQ DEC26", account_name: "prop", connection_name: "test",
});
const incident = () => [
  row(1, "balance", "18:24:54.000", { cashValue: 50000, netLiquidation: 50000, unrealizedProfitLoss: 0 }),
  row(2, "position", "18:24:55.440618", { marketPosition: "Long", quantity: 2 }),
  row(3, "execution", "18:24:57.518", { orderAction: "Buy", quantity: 2, price: 27018.5 }),
  row(4, "execution", "18:26:36.089", { orderAction: "Sell", quantity: 2, price: 27056.25 }),
  row(5, "balance", "18:26:39.231988", { cashValue: 51503, netLiquidation: 51296.5, unrealizedProfitLoss: 0 }),
  row(6, "balance", "18:26:42.212230", { cashValue: 51503, netLiquidation: 51503, unrealizedProfitLoss: 0 }),
];
const build = (rows = incident(), now = "18:27:00.000") => buildNinjaTechnicalOperations(rows, new Date(at(now)));

describe("missing Flat notification", () => {
  it("recovers the original incident from complete fills and independently settled balance", () => {
    const rows = incident();
    expect(build(rows)).toMatchObject([{ status: "closed", flatAt: at("18:26:36.089"), openingBalance: 50000, closingBalance: 51503, result: 1503 }]);
    expect(rows.some((event) => event.payload.marketPosition === "Flat")).toBe(false);
  });
  it("does not close a partial exit", () => {
    const rows = incident(); rows[3].payload.quantity = 1;
    expect(build(rows)[0].status).toBe("open");
  });
  it("does not trust a closing fill without the original entry", () => expect(build(incident().filter((event) => event.id !== 3))[0].status).toBe("open"));
  it("does not ignore a later open position", () => expect(build([...incident(), row(7, "position", "18:26:43.000", { marketPosition: "Long", quantity: 1 })])[0].status).toBe("open"));
  it("requires the latest balance to be settled and flat", () => {
    for (const payload of [{ cashValue: 51503, netLiquidation: 51504, unrealizedProfitLoss: 0 }, { cashValue: 51503, netLiquidation: 51503, unrealizedProfitLoss: 1 }]) {
      const rows = incident(); rows[5] = { ...rows[5], payload };
      expect(build(rows)[0].status).toBe("open");
    }
  });
  it("preserves the ten-second settlement window", () => expect(build(incident(), "18:26:49.000")[0].status).toBe("open"));
  it("does not merge re-entry into the preceding trade", () => {
    const next = [row(7, "execution", "18:28:00.000", { orderAction: "Buy", quantity: 1, price: 27050 }), row(8, "position", "18:28:00.001", { marketPosition: "Long", quantity: 1 })];
    expect(build([...incident(), ...next], "18:29:00.000").map((operation) => operation.status)).toEqual(["closed", "open"]);
  });
});
