import { describe, expect, it } from "vitest";

import { buildNinjaOperationProbe, type NinjaTelemetryRow } from "./operation-probe";

function row(id: number, eventType: NinjaTelemetryRow["event_type"], occurredAt: string, payload: Record<string, unknown>, instrument = "NQ 12-26"): NinjaTelemetryRow {
  return { account_name: "Broker Ivo", connection_name: "Ninja Ivo", event_type: eventType, id, instrument: eventType === "balance" ? null : instrument, occurred_at: occurredAt, payload };
}

describe("Ninja operation probe", () => {
  it("mantiene abierta una operación hasta que todas las posiciones quedan Flat", () => {
    const result = buildNinjaOperationProbe([
      row(1, "position", "2026-09-07T18:00:00.000Z", { marketPosition: "Long", quantity: 1 }),
      row(2, "position", "2026-09-07T18:00:01.000Z", { marketPosition: "Short", quantity: 1 }, "ES 12-26"),
      row(3, "position", "2026-09-07T18:00:02.000Z", { marketPosition: "Flat", quantity: 0 }),
    ], new Date("2026-09-07T18:01:00.000Z"));
    expect(result[0].status).toBe("open");
    expect(result[0].openPositions).toBe(1);
  });

  it("exige Flat, un saldo posterior y una ventana quieta", () => {
    const rows = [
      row(1, "position", "2026-09-07T18:00:00.000Z", { marketPosition: "Long", quantity: 1 }),
      row(2, "position", "2026-09-07T18:00:05.000Z", { marketPosition: "Flat", quantity: 0 }),
      row(3, "balance", "2026-09-07T18:00:06.000Z", { cashValue: 50_100, netLiquidation: 50_100 }),
    ];
    expect(buildNinjaOperationProbe(rows, new Date("2026-09-07T18:00:12.000Z"))[0].status).toBe("settling");
    expect(buildNinjaOperationProbe(rows, new Date("2026-09-07T18:00:17.000Z"))[0].status).toBe("ready");
  });

  it("no usa por sí sola la igualdad entre CashValue y NetLiquidation", () => {
    const result = buildNinjaOperationProbe([
      row(1, "position", "2026-09-07T18:00:00.000Z", { marketPosition: "Long", quantity: 1 }),
      row(2, "balance", "2026-09-07T18:00:20.000Z", { cashValue: 50_000, netLiquidation: 50_000 }),
    ], new Date("2026-09-07T18:01:00.000Z"));
    expect(result[0].status).toBe("open");
  });
});

