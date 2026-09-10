import { describe, expect, it } from "vitest";

import type { NinjaAccountSnapshot, NinjaInventorySnapshot } from "./ingestion-payload";
import { extractNinjaBrokerBalance } from "./broker-balance-event";

function account(
  accountName: string,
  balance: number,
  connectionName = "Ninja Ivo",
): NinjaAccountSnapshot {
  return {
    accountName,
    cashValue: balance,
    connectionName,
    connectionStatus: "Connected",
    netLiquidation: balance,
    providerName: "Provider31",
    realizedProfitLoss: 0,
    totalCashBalance: 0,
    unrealizedProfitLoss: 0,
  };
}

function snapshot(accounts: NinjaAccountSnapshot[]): NinjaInventorySnapshot {
  return {
    accounts,
    eventId: "event-1",
    kind: "inventory_snapshot",
    observedAt: "2026-08-28T14:00:00.000Z",
  };
}

describe("extractNinjaBrokerBalance", () => {
  it("suma las cuentas broker de conexiones nuevas o ya conocidas", () => {
    expect(
      extractNinjaBrokerBalance(
        snapshot([
          account("1850465", 6_674.58),
          account("2080996", 2_000),
          account("LFE05088021070001", 50_000, "Ninja Mauri"),
          account("Sim101", 100_000),
        ]),
        new Set(),
      ),
    ).toEqual({
      balanceInCents: 867_458,
      sourceAccounts: [
        { accountName: "1850465", balanceInCents: 667_458, connectionName: "Ninja Ivo" },
        { accountName: "2080996", balanceInCents: 200_000, connectionName: "Ninja Ivo" },
      ],
    });
  });

  it("no emite un total parcial si una cuenta broker tiene saldo inconsistente", () => {
    const inconsistent = { ...account("1850465", 6_674.58), netLiquidation: 6_700 };
    expect(
      extractNinjaBrokerBalance(snapshot([inconsistent]), new Set()),
    ).toBeNull();
  });

  it("excluye una conexión aislada expresamente", () => {
    expect(
      extractNinjaBrokerBalance(
        snapshot([account("1850465", 6_674.58)]),
        new Set(["Ninja Ivo"]),
      ),
    ).toBeNull();
  });
});
