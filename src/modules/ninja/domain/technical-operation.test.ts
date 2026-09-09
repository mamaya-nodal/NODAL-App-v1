import { describe, expect, it } from "vitest";

import type { NinjaTelemetryRow } from "./operation-probe";
import { buildNinjaTechnicalOperations } from "./technical-operation";

function row(id: number, eventType: NinjaTelemetryRow["event_type"], occurredAt: string, payload: Record<string, unknown>, instrument: string | null = null, accountName = "Sim101"): NinjaTelemetryRow {
  return { account_name: accountName, connection_name: "Ninja Mauri", event_type: eventType, id, instrument, occurred_at: occurredAt, payload };
}

describe("Ninja technical operations", () => {
  it("convierte una entrada y salida estabilizada en una operación cerrada", () => {
    const operations = buildNinjaTechnicalOperations([
      row(1, "balance", "2026-09-07T18:00:00.000Z", { cashValue: 100_000 }),
      row(2, "execution", "2026-09-07T18:00:01.000Z", {}, "MNQ SEP26"),
      row(3, "position", "2026-09-07T18:00:01.100Z", { marketPosition: "Long", quantity: 1 }, "MNQ SEP26"),
      row(4, "execution", "2026-09-07T18:00:10.000Z", {}, "MNQ SEP26"),
      row(5, "position", "2026-09-07T18:00:10.100Z", { marketPosition: "Flat", quantity: 0 }, "MNQ SEP26"),
      row(6, "balance", "2026-09-07T18:00:11.000Z", { cashValue: 100_000.5 }),
    ], new Date("2026-09-07T18:00:22.000Z"));

    expect(operations).toEqual([expect.objectContaining({
      closingBalance: 100_000.5,
      executionCount: 2,
      openingBalance: 100_000,
      openingEventId: 2,
      result: 0.5,
      status: "closed",
    })]);
  });

  it("no cierra durante la ventana de estabilización", () => {
    const operations = buildNinjaTechnicalOperations([
      row(1, "balance", "2026-09-07T18:00:00.000Z", { cashValue: 100_000 }),
      row(2, "position", "2026-09-07T18:00:01.000Z", { marketPosition: "Long", quantity: 1 }, "MNQ SEP26"),
      row(3, "position", "2026-09-07T18:00:05.000Z", { marketPosition: "Flat", quantity: 0 }, "MNQ SEP26"),
      row(4, "balance", "2026-09-07T18:00:06.000Z", { cashValue: 100_001 }),
    ], new Date("2026-09-07T18:00:12.000Z"));
    expect(operations[0].status).toBe("settling");
  });

  it("mantiene un mismo ciclo si vuelve a abrir antes de diez segundos", () => {
    const operations = buildNinjaTechnicalOperations([
      row(1, "balance", "2026-09-07T18:00:00.000Z", { cashValue: 100_000 }),
      row(2, "position", "2026-09-07T18:00:01.000Z", { marketPosition: "Long", quantity: 1 }, "MNQ SEP26"),
      row(3, "position", "2026-09-07T18:00:05.000Z", { marketPosition: "Flat", quantity: 0 }, "MNQ SEP26"),
      row(4, "balance", "2026-09-07T18:00:06.000Z", { cashValue: 100_001 }),
      row(5, "execution", "2026-09-07T18:00:09.000Z", {}, "MNQ SEP26"),
      row(6, "position", "2026-09-07T18:00:09.100Z", { marketPosition: "Long", quantity: 1 }, "MNQ SEP26"),
    ], new Date("2026-09-07T18:00:30.000Z"));
    expect(operations).toHaveLength(1);
    expect(operations[0].status).toBe("open");
  });

  it("procesa cinco cuentas simultáneas como cinco operaciones independientes", () => {
    const accountNames = ["TFY035", "TFY036", "TFY037", "TFY038", "TFY039"];
    const operations = accountNames.flatMap((accountName, index) => buildNinjaTechnicalOperations([
      row(index * 10 + 1, "balance", "2026-09-07T18:00:00.000Z", { cashValue: 50_000 + index }, null, accountName),
      row(index * 10 + 2, "position", "2026-09-07T18:00:01.000Z", { marketPosition: "Long", quantity: 1 }, "MNQ SEP26", accountName),
      row(index * 10 + 3, "position", "2026-09-07T18:00:05.000Z", { marketPosition: "Flat", quantity: 0 }, "MNQ SEP26", accountName),
      row(index * 10 + 4, "balance", "2026-09-07T18:00:06.000Z", { cashValue: 50_100 + index }, null, accountName),
    ], new Date("2026-09-07T18:00:20.000Z")));

    expect(operations).toHaveLength(5);
    expect(operations.map((operation) => operation.accountName)).toEqual(accountNames);
    expect(operations.every((operation) => operation.result === 100 && operation.status === "closed")).toBe(true);
  });
});
