import { describe, expect, it } from "vitest";

import { resolveDetectedAccountAccumulatedInCents } from "./detected-account-investment";

describe("resolveDetectedAccountAccumulatedInCents", () => {
  it("incorpora recuperaciones manuales sin duplicar controles Ninja", () => {
    expect(resolveDetectedAccountAccumulatedInCents({
      collectedPayoutsInCents: [10_000],
      manualAndAutomaticEntries: [
        { dailyControlId: "automatic", destination: "NETO BROKER -", magnitudeInCents: 2_000 },
        { dailyControlId: "manual-loss", destination: "NETO BROKER -", magnitudeInCents: 3_630 },
        { dailyControlId: "manual-gain", destination: "NETO BROKER +", magnitudeInCents: 5_804 },
      ],
      purchaseCostInCents: 27_230,
      technicalAllocationsInCents: [-2_000],
      technicalDailyControlIds: new Set(["automatic"]),
    })).toBe(-17_056);
  });

  it("conserva los centavos asignados por cuenta en una reparacion auditada", () => {
    expect(resolveDetectedAccountAccumulatedInCents({
      collectedPayoutsInCents: [],
      manualAndAutomaticEntries: [
        { dailyControlId: "t1", destination: "NETO BROKER -", magnitudeInCents: 11_608 },
        { dailyControlId: "t2", destination: "NETO BROKER -", magnitudeInCents: 3_630 },
        { dailyControlId: "t3", destination: "NETO BROKER -", magnitudeInCents: 5_444 },
        { dailyControlId: "t4", destination: "NETO BROKER -", magnitudeInCents: 6_344 },
        { dailyControlId: "t5", destination: "NETO BROKER +", magnitudeInCents: 5_804 },
      ],
      purchaseCostInCents: 27_230,
      technicalAllocationsInCents: [],
      technicalDailyControlIds: new Set(),
    })).toBe(-48_452);
  });
});
