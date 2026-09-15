import { describe, expect, it } from "vitest";

import type { NinjaTelemetryRow } from "./operation-probe";
import { buildNinjaTechnicalOperations } from "./technical-operation";

function row(id: number, eventType: NinjaTelemetryRow["event_type"], occurredAt: string, payload: Record<string, unknown>, instrument: string | null = null, accountName = "Sim101"): NinjaTelemetryRow {
  return { account_name: accountName, connection_name: "Ninja Mauri", event_type: eventType, id, instrument, occurred_at: occurredAt, payload };
}

describe("Ninja technical operations", () => {
  it("usa el inventario previo cuando Ninja envía la ejecución antes del primer saldo", () => {
    const operations = buildNinjaTechnicalOperations([
      row(2, "execution", "2026-09-15T12:18:23.000Z", {}, "NQ DEC26"),
      row(3, "position", "2026-09-15T12:18:23.100Z", { marketPosition: "Long", quantity: 3 }, "NQ DEC26"),
      row(4, "balance", "2026-09-15T12:18:24.000Z", { cashValue: 49_995.86, netLiquidation: 49_990 }),
      row(5, "position", "2026-09-15T12:24:00.000Z", { marketPosition: "Flat", quantity: 0 }, "NQ DEC26"),
      row(6, "balance", "2026-09-15T12:24:01.000Z", { cashValue: 48_002.72, netLiquidation: 48_002.72 }),
    ], new Date("2026-09-15T12:24:12.000Z"), 50_000);

    expect(operations[0]).toMatchObject({
      closingBalance: 48_002.72,
      openingBalance: 50_000,
      result: -1_997.28,
      status: "closed",
    });
  });

  it("conserva el mínimo intradiario de Net Liquidation como evidencia de quema", () => {
    const operations = buildNinjaTechnicalOperations([
      row(1, "balance", "2026-09-15T12:18:22.000Z", { cashValue: 50_000, netLiquidation: 50_000 }),
      row(2, "position", "2026-09-15T12:18:23.000Z", { marketPosition: "Long", quantity: 3 }, "NQ DEC26"),
      row(3, "balance", "2026-09-15T12:23:59.000Z", { cashValue: 49_995.86, netLiquidation: 47_996.36 }),
      row(4, "position", "2026-09-15T12:24:00.000Z", { marketPosition: "Flat", quantity: 0 }, "NQ DEC26"),
      row(5, "balance", "2026-09-15T12:24:01.000Z", { cashValue: 48_002.72, netLiquidation: 48_002.72 }),
    ], new Date("2026-09-15T12:24:12.000Z"));

    expect(operations[0]).toMatchObject({
      minimumNetLiquidation: 47_996.36,
      minimumNetLiquidationAt: "2026-09-15T12:23:59.000Z",
    });
  });

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

  it("incluye las comisiones descontadas instantes antes de informar la posición", () => {
    const operations = buildNinjaTechnicalOperations([
      row(1, "balance", "2026-09-11T18:55:07.000Z", { cashValue: 50_000, netLiquidation: 50_000 }),
      row(2, "balance", "2026-09-11T18:56:28.711Z", { cashValue: 49_995.86, netLiquidation: 50_000 }),
      row(3, "position", "2026-09-11T18:56:28.715Z", { marketPosition: "Long", quantity: 3 }, "NQ SEP26"),
      row(4, "position", "2026-09-11T19:50:00.242Z", { marketPosition: "Flat", quantity: 0 }, "NQ SEP26"),
      row(5, "balance", "2026-09-11T19:50:00.500Z", { cashValue: 47_747.72, netLiquidation: 47_747.72 }),
    ], new Date("2026-09-11T19:50:11.000Z"));

    expect(operations[0]).toEqual(expect.objectContaining({
      closingBalance: 47_747.72,
      openingBalance: 50_000,
      result: -2_252.28,
      status: "closed",
    }));
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
