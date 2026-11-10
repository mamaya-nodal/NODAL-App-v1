export const LUCID_FLEX_50K_RISK_VERSION = "lucid-flex-50k-2026-11-10";

export const LUCID_FLEX_50K_RISK = Object.freeze({
  accountSizeInCents: 5_000_000,
  consistencyPercent: 50,
  dailyLossLimitInCents: 120_000,
  dailyLossLimitMode: "soft" as const,
  drawdownType: "EOD" as const,
  lockedMaxLossBalanceInCents: 5_010_000,
  maxLossLimitInCents: 200_000,
  maxMicros: 40,
  maxMinis: 4,
  onDemandPayouts: true,
  profitTargetInCents: 300_000,
  version: LUCID_FLEX_50K_RISK_VERSION,
});

export function lucidFlexDailyRiskState(input: Readonly<{
  currentBalanceInCents: number;
  maxLossBalanceInCents: number;
  sessionStartBalanceInCents: number;
}>): "active" | "daily_locked" | "burned" {
  if (input.currentBalanceInCents <= input.maxLossBalanceInCents) return "burned";
  return input.sessionStartBalanceInCents - input.currentBalanceInCents
      >= LUCID_FLEX_50K_RISK.dailyLossLimitInCents
    ? "daily_locked"
    : "active";
}
