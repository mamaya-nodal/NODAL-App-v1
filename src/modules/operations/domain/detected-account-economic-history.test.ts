import { describe, expect, it } from "vitest";

import { buildDetectedAccountEconomicHistory } from "./detected-account-economic-history";

describe("buildDetectedAccountEconomicHistory", () => {
  it("mantiene separados los controles del mismo día y conserva la etapa de cada uno", () => {
    expect(buildDetectedAccountEconomicHistory({
      accumulatedInCents: -13_800,
      accountingEntries: [
        { dailyControlId: "control-1", phase: "Evaluacion" },
        { dailyControlId: "control-2", phase: "Evaluacion" },
        { dailyControlId: "control-3", phase: "Primera vuelta" },
      ],
      trades: [
        { brokerResultInCents: -11_015, dailyControlId: "control-1", openedAt: "2026-09-16T12:00:00Z", propResultInCents: 151_272 },
        { brokerResultInCents: -21_230, dailyControlId: "control-2", openedAt: "2026-09-17T12:00:00Z", propResultInCents: 151_272 },
        { brokerResultInCents: -97_690, dailyControlId: "control-3", openedAt: "2026-09-17T14:00:00Z", propResultInCents: 383_848 },
      ],
    })).toEqual([
      { accumulatedInCents: -24_815, brokerResultInCents: -11_015, phase: "Evaluacion", propResultInCents: 151_272, tradeNumber: 1 },
      { accumulatedInCents: -46_045, brokerResultInCents: -21_230, phase: "Evaluacion", propResultInCents: 151_272, tradeNumber: 2 },
      { accumulatedInCents: -143_735, brokerResultInCents: -97_690, phase: "Primera vuelta", propResultInCents: 383_848, tradeNumber: 3 },
    ]);
  });
});
