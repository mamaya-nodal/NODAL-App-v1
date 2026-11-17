import { describe, expect, it } from "vitest";

import { buildNinjaOperationProbe, type NinjaTelemetryRow } from "./operation-probe";

function row(id: number, eventType: NinjaTelemetryRow["event_type"], occurredAt: string, payload: Record<string, unknown>, instrument = "NQ 12-26"): NinjaTelemetryRow {
  return { account_name: "Broker Ivo", connection_name: "Ninja Ivo", event_type: eventType, id, instrument: eventType === "balance" ? null : instrument, occurred_at: occurredAt, payload };
}

describe("Ninja operation probe", () => {
  const closure = { account_name: "Broker Ivo", connection_name: "Ninja Ivo", opened_at: "2026-09-07T18:00:00.000Z",
    flat_at: "2026-09-07T18:00:05.000Z", settled_at: "2026-09-07T18:00:16.000Z", status: "closed", instruments: ["NQ 12-26"] };
  const staleRows = () => [row(1, "position", closure.opened_at, { marketPosition: "Long", quantity: 2 }),
    row(2, "balance", "2026-09-07T18:00:06.000Z", { cashValue: 51503, netLiquidation: 51503 })];
  it("reflects a verified server closure without requiring a fabricated Flat event", () => {
    expect(buildNinjaOperationProbe(staleRows(), new Date("2026-09-07T18:01:00Z"), [closure])[0]).toMatchObject({ status: "ready", openPositions: 0 });
  });
  it("does not hide a newer execution or position", () => {
    for (const event of [row(3, "execution", "2026-09-07T18:00:07Z", {}), row(3, "position", "2026-09-07T18:00:07Z", { marketPosition: "Long", quantity: 1 })]) {
      expect(buildNinjaOperationProbe([...staleRows(), event], new Date("2026-09-07T18:01:00Z"), [closure])[0].status).toBe("open");
    }
  });
  it("does not hide an instrument absent from the closed session", () => {
    const rows = [...staleRows(), row(3, "position", "2026-09-07T18:00:01Z", { marketPosition: "Long", quantity: 1 }, "ES 12-26")];
    expect(buildNinjaOperationProbe(rows, new Date("2026-09-07T18:01:00Z"), [closure])[0].openPositions).toBe(1);
  });
  it("preserves a newer open technical session", () => {
    const open = { ...closure, opened_at: "2026-09-07T18:00:07Z", status: "open", flat_at: null, settled_at: null };
    expect(buildNinjaOperationProbe(staleRows(), new Date("2026-09-07T18:01:00Z"), [closure, open])[0].status).toBe("open");
  });
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

