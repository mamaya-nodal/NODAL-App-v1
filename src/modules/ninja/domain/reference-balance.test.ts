import { describe, expect, it } from "vitest";
import type { NinjaAccountSnapshot } from "./ingestion-payload";
import { resolveNinjaReferenceBalance } from "./reference-balance";

function account(cashValue: number | null, netLiquidation: number | null): NinjaAccountSnapshot {
  return { accountName: "LFE1", cashValue, connectionName: "Lucid", connectionStatus: "Connected", netLiquidation, providerName: "Provider31", realizedProfitLoss: null, totalCashBalance: null, unrealizedProfitLoss: null };
}

describe("resolveNinjaReferenceBalance", () => {
  it("habilita automatización solamente cuando ambos saldos coinciden al centavo", () => {
    expect(resolveNinjaReferenceBalance(account(50_000, 50_000))).toEqual({ balanceInCents: 5_000_000, status: "verified" });
  });

  it("deriva a revisión si falta un campo o existe una diferencia", () => {
    expect(resolveNinjaReferenceBalance(account(50_000, null)).status).toBe("missing");
    expect(resolveNinjaReferenceBalance(account(50_000, 49_999.99)).status).toBe("conflict");
  });
});
