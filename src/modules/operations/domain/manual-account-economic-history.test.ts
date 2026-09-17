import { describe, expect, it } from "vitest";

import { buildManualAccountEconomicHistory } from "./manual-account-economic-history";

describe("buildManualAccountEconomicHistory", () => {
  it("incorpora coberturas conciliadas a los últimos trades manuales sin duplicarlos", () => {
    expect(buildManualAccountEconomicHistory({
      accumulatedInCents: -13800,
      balanceHistory: [
        { cashValueInCents: 5_150_450, initialBalanceInCents: 5_000_000, tradeNumber: 1 },
        { cashValueInCents: 5_150_450, initialBalanceInCents: 5_000_000, tradeNumber: 2 },
        { cashValueInCents: 5_016_500, initialBalanceInCents: 5_000_000, tradeNumber: 3 },
      ],
      brokerHistory: [
        { brokerResultInCents: -16_614, phase: "Evaluacion" },
        { brokerResultInCents: -5_745, phase: "Primera vuelta" },
      ],
    })).toEqual([
      { accumulatedInCents: -13_800, brokerResultInCents: null, phase: "Evaluacion", propResultInCents: 150_450, tradeNumber: 1 },
      { accumulatedInCents: -30_414, brokerResultInCents: -16_614, phase: "Evaluacion", propResultInCents: 0, tradeNumber: 2 },
      { accumulatedInCents: -36_159, brokerResultInCents: -5_745, phase: "Primera vuelta", propResultInCents: -133_950, tradeNumber: 3 },
    ]);
  });

  it("conserva los trades todavía no conciliados con resultado broker vacío", () => {
    expect(buildManualAccountEconomicHistory({
      accumulatedInCents: -10_000,
      balanceHistory: [
        { cashValueInCents: 5_100_000, initialBalanceInCents: 5_000_000, tradeNumber: 1 },
        { cashValueInCents: 5_200_000, initialBalanceInCents: 5_000_000, tradeNumber: 2 },
      ],
      brokerHistory: [],
    })).toEqual([
      { accumulatedInCents: -10_000, brokerResultInCents: null, phase: "Evaluacion", propResultInCents: 100_000, tradeNumber: 1 },
      { accumulatedInCents: -10_000, brokerResultInCents: null, phase: "Evaluacion", propResultInCents: 100_000, tradeNumber: 2 },
    ]);
  });
});
