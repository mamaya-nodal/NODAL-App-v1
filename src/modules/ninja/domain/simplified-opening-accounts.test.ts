import { describe, expect, it } from "vitest";

import { ninjaAccountRegistrationKey } from "./account-registration-key";
import { buildSimplifiedOpeningAccounts } from "./simplified-opening-accounts";

const account = (accountName: string, connectionName: string) => ({
  accountName,
  cashValue: 50_000,
  connectionName,
  connectionStatus: "Connected",
  netLiquidation: 50_000,
  providerName: "Provider31",
  realizedProfitLoss: 0,
  totalCashBalance: 0,
  unrealizedProfitLoss: 0,
});

describe("simplified opening accounts", () => {
  it("includes prop accounts reported by identity connectors", () => {
    const result = buildSimplifiedOpeningAccounts({
      companies: [{ code: "TRADEFY", displayName: "Tradeify", id: "tradeify" }],
      inventories: [
        {
          accounts: [account("2199664", "NINJAL")],
          connectorId: "personal",
          observedAt: "2026-10-26T17:13:36.000Z",
        },
        {
          accounts: [
            account("FTDFYSLX50691920237", "Tradify"),
            account("FTDFYSLX50531824250", "Tradify"),
          ],
          connectorId: "identity-david",
          observedAt: "2026-10-26T17:13:36.000Z",
        },
      ],
      registeredAccountKeys: new Set(),
    });

    expect(result).toHaveLength(2);
    expect(result.map((candidate) => candidate.connectorId)).toEqual([
      "identity-david",
      "identity-david",
    ]);
  });

  it("does not repeat an identity account that is already registered", () => {
    const result = buildSimplifiedOpeningAccounts({
      companies: [{ code: "TRADEFY", displayName: "Tradeify", id: "tradeify" }],
      inventories: [{
        accounts: [account("FTDFYSLX50691920237", "Tradify")],
        connectorId: "identity-david",
        observedAt: "2026-10-26T17:13:36.000Z",
      }],
      registeredAccountKeys: new Set([
        ninjaAccountRegistrationKey("identity-david", "Tradify", "FTDFYSLX50691920237"),
      ]),
    });

    expect(result).toEqual([]);
  });
});
