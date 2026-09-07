import { describe, expect, it } from "vitest";

import type { NinjaTradeTelemetryEvent } from "./trade-telemetry";
import { collapseRepeatedBalanceTelemetry, telemetryAccountKey } from "./telemetry-dedupe";

const base = {
  accountName: "Sim101",
  connectionName: "Ninja Mauri",
  occurredAt: "2026-09-07T22:35:00.000Z",
  providerName: "Simulation",
};

function balance(eventId: string, cashValue = 100_000): NinjaTradeTelemetryEvent {
  return { ...base, cashValue, eventId, kind: "balance", netLiquidation: cashValue,
    realizedProfitLoss: 0, totalCashBalance: cashValue, unrealizedProfitLoss: 0 };
}

describe("Ninja telemetry deduplication", () => {
  it("descarta saldos consecutivos sin cambios", () => {
    const events = collapseRepeatedBalanceTelemetry([balance("1"), balance("2")], new Map());
    expect(events.map((event) => event.eventId)).toEqual(["1"]);
  });

  it("conserva un saldo posterior a una posición Flat aunque su importe sea igual", () => {
    const initial = new Map([[telemetryAccountKey(base.connectionName, base.accountName), {
      balanceSignature: JSON.stringify([100_000, 100_000, 100_000, 0, 0]),
      eventType: "balance" as const,
    }]]);
    const position: NinjaTradeTelemetryEvent = { ...base, averagePrice: 20_000, eventId: "flat",
      instrument: "MNQ SEP26", kind: "position", marketPosition: "Flat", quantity: 0 };
    const events = collapseRepeatedBalanceTelemetry([position, balance("after-flat")], initial);
    expect(events.map((event) => event.eventId)).toEqual(["flat", "after-flat"]);
  });

  it("conserva cambios reales de saldo", () => {
    const events = collapseRepeatedBalanceTelemetry([balance("1"), balance("2", 100_000.5)], new Map());
    expect(events).toHaveLength(2);
  });
});
