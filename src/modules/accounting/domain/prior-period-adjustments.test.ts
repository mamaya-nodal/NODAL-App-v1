import { describe, expect, it } from "vitest";

import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";
import { applyPriorPeriodAdjustments } from "./prior-period-adjustments";

const base = {
  accumulatedResultInCents: 50_000,
  commissionInCents: 20_000,
  positionDifferenceInCents: 0,
  positionExpectedInCents: 150_000,
  positionObservableInCents: 150_000,
  traderGainInCents: 30_000,
} as OperationalSummary;

describe("ajustes de períodos anteriores", () => {
  it("afecta el período vigente sin mezclarlo con su resultado operativo", () => {
    const adjusted = applyPriorPeriodAdjustments(base, {
      commissionInCents: 4_000,
      resultInCents: 10_000,
    });

    expect(adjusted).toMatchObject({
      accumulatedResultInCents: 60_000,
      commissionInCents: 24_000,
      positionDifferenceInCents: -10_000,
      positionExpectedInCents: 160_000,
      priorPeriodCommissionAdjustmentInCents: 4_000,
      priorPeriodResultAdjustmentInCents: 10_000,
      traderGainInCents: 36_000,
    });
  });

  it("no crea una copia cuando no existen ajustes", () => {
    expect(applyPriorPeriodAdjustments(base, {
      commissionInCents: 0,
      resultInCents: 0,
    })).toBe(base);
  });
});

