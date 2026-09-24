import { describe, expect, it } from "vitest";

import { canConfigurePeriodOpening } from "./opening-eligibility";

const emptyOpening = {
  accountCount: 0,
  dailyControls: [],
  fundingWithdrawalCount: 0,
  hasOpeningSnapshot: false,
  operationEntryCount: 0,
  walletMovementCount: 0,
} as const;

describe("period opening eligibility", () => {
  it("allows setup before any activity", () => {
    expect(canConfigurePeriodOpening(emptyOpening)).toBe(true);
  });

  it("allows the provisional broker balance created by the connector", () => {
    expect(canConfigurePeriodOpening({
      ...emptyOpening,
      dailyControls: [{
        controlNumber: 1,
        kind: "deposit",
        originDestination: "Aporte trader",
        source: "ninjatrader",
        sourceEventKey: "ninja-balance:8cd21e90-7f38-4c63-bf4d-b18469544d64",
      }],
    })).toBe(true);
  });

  it("does not allow setup after a real movement", () => {
    expect(canConfigurePeriodOpening({
      ...emptyOpening,
      dailyControls: [{
        controlNumber: 1,
        kind: "deposit",
        originDestination: "Aporte trader",
        source: "manual",
        sourceEventKey: null,
      }],
    })).toBe(false);
  });

  it("does not allow setup after an opening was confirmed", () => {
    expect(canConfigurePeriodOpening({ ...emptyOpening, hasOpeningSnapshot: true })).toBe(false);
  });
});
