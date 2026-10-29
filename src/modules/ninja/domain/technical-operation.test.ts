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

  it("recupera el saldo previo cuando la comisión llega entre ejecución y posición", () => {
    const operations = buildNinjaTechnicalOperations([
      row(1, "execution", "2026-10-27T16:54:31.046Z", { orderAction: "BuyToCover", price: 29_791.5, quantity: 1 }, "NQ DEC26"),
      row(2, "balance", "2026-10-27T16:54:31.582Z", {
        cashValue: 1_862.23,
        netLiquidation: 1_863.61,
        realizedProfitLoss: 0,
        unrealizedProfitLoss: 0,
      }),
      row(3, "position", "2026-10-27T16:54:32.395Z", { marketPosition: "Long", quantity: 1 }, "NQ DEC26"),
      row(4, "position", "2026-10-27T17:03:32.256Z", { marketPosition: "Flat", quantity: 0 }, "NQ DEC26"),
      row(5, "balance", "2026-10-27T17:03:33.564Z", { cashValue: 1_827.87, netLiquidation: 1_827.87 }),
    ], new Date("2026-10-27T17:03:45.000Z"), 1_862.23);

    expect(operations[0]).toEqual(expect.objectContaining({
      closingBalance: 1_827.87,
      openingBalance: 1_863.61,
      result: -35.74,
    }));
  });

  it("incluye la comisión aunque Ninja demore más de dos segundos en informar la posición", () => {
    const operations = buildNinjaTechnicalOperations([
      row(865082, "execution", "2026-10-29T14:23:04.506Z", {
        orderAction: "BuyToCover", price: 29_581.25, quantity: 1,
      }, "NQ DEC26", "2196146"),
      row(865083, "balance", "2026-10-29T14:23:06.326Z", {
        cashValue: 1_762.17,
        netLiquidation: 1_763.55,
        realizedProfitLoss: 0,
        unrealizedProfitLoss: 0,
      }, null, "2196146"),
      row(865093, "balance", "2026-10-29T14:23:07.608Z", {
        cashValue: 1_760.68,
        netLiquidation: 1_760.68,
        realizedProfitLoss: -2.87,
        unrealizedProfitLoss: 0,
      }, null, "2196146"),
      row(865096, "position", "2026-10-29T14:23:07.866Z", {
        marketPosition: "Long", quantity: 1,
      }, "NQ DEC26", "2196146"),
      row(865102, "execution", "2026-10-29T14:23:11.333Z", {
        orderAction: "Sell", price: 29_575.25, quantity: 1,
      }, "NQ DEC26", "2196146"),
      row(865118, "position", "2026-10-29T14:23:14.805Z", {
        marketPosition: "Flat", quantity: 0,
      }, "NQ DEC26", "2196146"),
      row(865124, "balance", "2026-10-29T14:23:16.812Z", {
        cashValue: 1_637.81,
        netLiquidation: 1_637.81,
        realizedProfitLoss: -125.74,
        unrealizedProfitLoss: 0,
      }, null, "2196146"),
    ], new Date("2026-10-29T14:23:27.000Z"), 1_763.55);

    expect(operations).toEqual([expect.objectContaining({
      closingBalance: 1_637.81,
      executionCount: 2,
      openingBalance: 1_763.55,
      openingEventId: 865082,
      result: -125.74,
      status: "closed",
    })]);
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

  it("separa una reversión cerrada en la cobertura y el trade accidental", () => {
    const operations = buildNinjaTechnicalOperations([
      row(1, "balance", "2026-10-27T17:08:54.000Z", { cashValue: 1_827.87, netLiquidation: 1_827.87 }),
      row(2, "execution", "2026-10-27T17:08:56.849Z", { orderAction: "SellShort", price: 29_805.75, quantity: 1 }, "NQ DEC26"),
      row(3, "position", "2026-10-27T17:08:55.771Z", { averagePrice: 29_805.75, marketPosition: "Short", quantity: 1 }, "NQ DEC26"),
      row(4, "execution", "2026-10-27T17:11:07.631Z", { orderAction: "BuyToCover", price: 29_810.25, quantity: 1 }, "NQ DEC26"),
      row(5, "position", "2026-10-27T17:11:07.374Z", { marketPosition: "Flat", quantity: 0 }, "NQ DEC26"),
      row(6, "execution", "2026-10-27T17:11:08.726Z", { orderAction: "BuyToCover", price: 29_809.75, quantity: 1 }, "NQ DEC26"),
      row(7, "position", "2026-10-27T17:11:07.820Z", { averagePrice: 29_809.75, marketPosition: "Long", quantity: 1 }, "NQ DEC26"),
      row(8, "execution", "2026-10-27T17:11:10.288Z", { orderAction: "Sell", price: 29_807.25, quantity: 1 }, "NQ DEC26"),
      row(9, "position", "2026-10-27T17:11:09.915Z", { marketPosition: "Flat", quantity: 0 }, "NQ DEC26"),
      row(10, "balance", "2026-10-27T17:11:11.126Z", { cashValue: 1_676.39, netLiquidation: 1_676.39 }),
    ], new Date("2026-10-27T17:11:22.000Z"));

    expect(operations).toEqual([
      expect.objectContaining({
        closingBalance: 1_732.13,
        direction: "Short",
        openingBalance: 1_827.87,
        openingEventId: 3,
        result: -95.74,
      }),
      expect.objectContaining({
        closingBalance: 1_676.39,
        direction: "Long",
        openingBalance: 1_732.13,
        openingEventId: 7,
        result: -55.74,
      }),
    ]);
  });

  it("no inventa una operación nueva con una ejecución de cierre recibida después del saldo plano", () => {
    const operations = buildNinjaTechnicalOperations([
      row(1, "balance", "2026-09-28T15:07:20.000Z", { cashValue: 47_964.5, netLiquidation: 47_964.5 }),
      row(2, "execution", "2026-09-28T15:07:20.165Z", { orderAction: "BuyToCover" }, "NQ DEC26"),
    ], new Date("2026-09-28T15:07:40.000Z"));

    expect(operations).toEqual([]);
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
