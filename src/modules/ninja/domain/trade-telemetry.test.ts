import { describe, expect, it } from "vitest";

import { isNinjaTradeTelemetryBatch } from "./trade-telemetry";

const position = {
  accountName: "Sim101",
  averagePrice: 24_100.25,
  connectionName: "Ninja Mauri",
  eventId: "position-1",
  instrument: "NQ 12-26",
  kind: "position",
  marketPosition: "Long",
  occurredAt: "2026-09-07T18:00:00.000Z",
  providerName: "Rithmic",
  quantity: 2,
} as const;

describe("Ninja trade telemetry", () => {
  it("acepta eventos acotados de posición, ejecución y saldo", () => {
    expect(isNinjaTradeTelemetryBatch({
      batchId: "batch-1",
      events: [position, {
        accountName: "Sim101", connectionName: "Ninja Mauri", eventId: "execution-1",
        executionId: "exec-123", instrument: "NQ 12-26", kind: "execution",
        marketPosition: "Long", occurredAt: "2026-09-07T18:00:00.100Z",
        orderAction: "Buy", orderId: "order-123", price: 24_100.25,
        providerName: "Rithmic", quantity: 2,
      }, {
        accountName: "Sim101", cashValue: 50_000, connectionName: "Ninja Mauri",
        eventId: "balance-1", kind: "balance", netLiquidation: 50_025,
        occurredAt: "2026-09-07T18:00:01.000Z", providerName: "Rithmic",
        realizedProfitLoss: 0, totalCashBalance: 50_000, unrealizedProfitLoss: 25,
      }],
      kind: "trade_telemetry_batch",
      observedAt: "2026-09-07T18:00:01.000Z",
    })).toBe(true);
  });

  it("rechaza cantidades de ejecución inválidas", () => {
    expect(isNinjaTradeTelemetryBatch({
      batchId: "batch-1",
      events: [{ ...position, kind: "execution", quantity: 0 }],
      kind: "trade_telemetry_batch",
      observedAt: "2026-09-07T18:00:01.000Z",
    })).toBe(false);
  });
});

