import { describe, expect, it } from "vitest";

import { buildBrokerBalanceHistory } from "./broker-balance-history";

describe("buildBrokerBalanceHistory", () => {
  it("includes every reconciled control even when its technical balance event is missing", () => {
    const rows = buildBrokerBalanceHistory([
      {
        balanceAfterInCents: 228_500,
        balanceBeforeInCents: 248_648,
        controlId: "control-23",
        createdAt: "2026-11-10T17:18:29.277Z",
        kind: "balance_update",
        operatedOn: "2026-11-10",
        operatingResultInCents: -20_148,
      },
      {
        balanceAfterInCents: 203_352,
        balanceBeforeInCents: 228_500,
        controlId: "control-24",
        createdAt: "2026-11-10T17:18:30.450Z",
        kind: "balance_update",
        operatedOn: "2026-11-10",
        operatingResultInCents: -25_148,
      },
      {
        balanceAfterInCents: 191_778,
        balanceBeforeInCents: 203_352,
        controlId: "control-25",
        createdAt: "2026-11-10T17:18:31.477Z",
        kind: "balance_update",
        operatedOn: "2026-11-10",
        operatingResultInCents: -11_574,
      },
    ], []);

    expect(rows.map((row) => row.controlId)).toEqual(["control-25", "control-24", "control-23"]);
    expect(rows.map((row) => row.changeInCents)).toEqual([-11_574, -25_148, -20_148]);
  });

  it("uses the technical event time without duplicating the reconciled control", () => {
    const rows = buildBrokerBalanceHistory([
      {
        balanceAfterInCents: 181_204,
        balanceBeforeInCents: 191_778,
        controlId: "control-26",
        createdAt: "2026-11-11T16:20:39.910Z",
        kind: "balance_update",
        operatedOn: "2026-11-11",
        operatingResultInCents: -10_574,
      },
    ], [
      {
        balanceInCents: 181_204,
        controlId: "control-26",
        id: "event-26",
        observedAt: "2026-11-11T14:58:58.606Z",
        sourceEventId: "ninja-operation:1226196",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      controlId: "control-26",
      id: "event-26",
      observedAt: "2026-11-11T14:58:58.606Z",
    });
  });

  it("keeps standalone balance observations such as the initial broker reading", () => {
    const rows = buildBrokerBalanceHistory([], [
      {
        balanceInCents: 435_604,
        controlId: null,
        id: "initial-event",
        observedAt: "2026-10-22T14:25:00.000Z",
        sourceEventId: "ninja-initial:2234971",
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({ id: "initial-event", kind: "initial", balanceInCents: 435_604 }),
    ]);
  });
});
