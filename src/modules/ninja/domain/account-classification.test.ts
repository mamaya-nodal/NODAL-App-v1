import { describe, expect, it } from "vitest";

import type { NinjaAccountSnapshot } from "./ingestion-payload";
import { classifyNinjaAccount, hasApprovedAutomaticRiskRule } from "./account-classification";

function account(accountName: string, connectionName = "Ninja"): NinjaAccountSnapshot {
  return {
    accountName, cashValue: null, connectionName, connectionStatus: "Connected",
    netLiquidation: null, providerName: "Provider31", realizedProfitLoss: null,
    totalCashBalance: null, unrealizedProfitLoss: null,
  };
}

describe("classifyNinjaAccount", () => {
  it("reconoce una cuenta Lucid Flex de evaluación y sugiere la fecha argentina", () => {
    expect(classifyNinjaAccount(account("LFE05088021070001", "Lucid"), "2026-08-27T01:30:00Z")).toEqual({
      accountName: "LFE05088021070001", accountSizeInCents: 5_000_000, company: "Lucid", companyCode: "LUCID", connectionName: "Lucid",
      firstSeenAt: "2026-08-27T01:30:00Z", phase: "Evaluation", product: "Flex", suggestedPurchaseDate: "2026-08-26", type: "prop",
    });
  });

  it.each([
    ["LFF05088021070001", "Lucid", "LUCID", "Funded", "Flex"],
    ["LFL05088021070001", "Lucid", "LUCID", "Live", "Flex"],
    ["LMX05864398090001", "Lucid", "LUCID", "Evaluation", "MAXX"],
    ["LMXF05864398090001", "Lucid", "LUCID", "Funded", "MAXX"],
    ["LMXL05864398090001", "Lucid", "LUCID", "Live", "MAXX"],
    ["MFFUEVRPD506724052", "My Funded Futures", "MFF", "Evaluation", "Rapid EOD"],
    ["MFFUSFREOD506724056", "My Funded Futures", "MFF", "Funded", "Rapid EOD"],
    ["50KTC-V2-577166-1", "Topstep", "TOPSTEP", "Evaluation", "Trading Combine"],
    ["EXPRESS-V2-CT-577166-1", "Topstep", "TOPSTEP", "Funded", "Express"],
    ["TOPX577166", "Topstep", "TOPSTEP", "Live", null],
    ["FFF396922", "Funded Futures Family", "FFF", "Evaluation", "Prime 50K"],
    ["FFFUNDED922746", "Funded Futures Family", "FFF", "Funded", "Prime 50K"],
    ["FTMO157754", "FTMO", "FTMO", "Evaluation", "Growth"],
    ["FTMO384610", "FTMO", "FTMO", "Evaluation", "Growth"],
    ["FTMO314114", "FTMO", "FTMO", "Evaluation", "Growth"],
    ["TDFYSL50123456", "Tradeify", "TRADEFY", "Evaluation", "Select"],
    ["FTDFYSLX50123456", "Tradeify", "TRADEFY", "Funded", "Select Flex"],
    ["TAKEPROFIT123456", "Take Profit Trader", "TPT", "Evaluation", null],
    ["TAKEPROFITPRO123456", "Take Profit Trader", "TPT", "Funded", "PRO"],
  ] as const)("clasifica %s sin confundir prefijos solapados", (name, company, companyCode, phase, product) => {
    expect(classifyNinjaAccount(account(name), "2026-08-26T12:00:00Z")).toMatchObject({ accountSizeInCents: 5_000_000, company, companyCode, phase, product, type: "prop" });
  });

  it("no inventa clasificación para nomenclaturas ambiguas o no confirmadas", () => {
    expect(classifyNinjaAccount(account("2080996"), "2026-08-26T12:00:00Z").type).toBe("broker");
    expect(classifyNinjaAccount(account("FN***"), "2026-08-26T12:00:00Z").type).toBe("unknown");
    expect(classifyNinjaAccount(account("MFFULIVE506724"), "2026-08-26T12:00:00Z").type).toBe("unknown");
  });

  it("separa simuladores y rechaza coincidencias parciales", () => {
    expect(classifyNinjaAccount(account("Sim101"), "2026-08-26T12:00:00Z").type).toBe("simulator");
    expect(classifyNinjaAccount(account("LFE-NO-CONFIRMADA"), "2026-08-26T12:00:00Z").type).toBe("unknown");
    expect(classifyNinjaAccount(account("FFFUNDEDABCDEF"), "2026-08-26T12:00:00Z").type).toBe("unknown");
    expect(classifyNinjaAccount(account("FTMO-157754"), "2026-08-26T12:00:00Z").type).toBe("unknown");
    expect(classifyNinjaAccount(account("XFTMO157754"), "2026-08-26T12:00:00Z").type).toBe("unknown");
  });

  it("detecta la nomenclatura aprobada como FTMO Futures Growth 50K", () => {
    const detected = classifyNinjaAccount(account("FTMO157754", "FTMO NinjaTrader"), "2026-09-21T12:00:00Z");
    expect(detected).toMatchObject({
      accountSizeInCents: 5_000_000,
      company: "FTMO",
      companyCode: "FTMO",
      phase: "Evaluation",
      product: "Growth",
      type: "prop",
    });
    expect(hasApprovedAutomaticRiskRule(detected)).toBe(true);
  });
});
