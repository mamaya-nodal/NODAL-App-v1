import { describe, expect, it } from "vitest";
import { lucidFlexDailyRiskState } from "./lucid-flex-risk";

describe("LucidFlex 50K risk", () => {
  it("treats the USD 1,200 DLL as a daily lock, not a burn", () => {
    expect(lucidFlexDailyRiskState({
      currentBalanceInCents: 4_880_000,
      maxLossBalanceInCents: 4_800_000,
      sessionStartBalanceInCents: 5_000_000,
    })).toBe("daily_locked");
  });

  it("gives the hard MLL precedence over the daily lock", () => {
    expect(lucidFlexDailyRiskState({
      currentBalanceInCents: 4_800_000,
      maxLossBalanceInCents: 4_800_000,
      sessionStartBalanceInCents: 5_000_000,
    })).toBe("burned");
  });

  it("stays active below the daily loss cap", () => {
    expect(lucidFlexDailyRiskState({
      currentBalanceInCents: 4_880_001,
      maxLossBalanceInCents: 4_800_000,
      sessionStartBalanceInCents: 5_000_000,
    })).toBe("active");
  });
});
