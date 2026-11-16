import { describe, expect, it } from "vitest";
import { observeTrackedNinjaAccount, operationBurnFloor, startTrackingNinjaAccount } from "./account-transition-engine";

const initial = () => startTrackingNinjaAccount({ accountSizeInCents: 5_000_000,
  balanceInCents: 5_000_000, companyCode: "LUCID", externalAccountName: "LFE-Franco",
  phase: "Evaluation", product: "Flex" }, "2026-11-12");

describe("historical EOD burn floors", () => {
  it("does not burn Franco's first trade with the next day's floor", () => {
    const close = observeTrackedNinjaAccount(initial(), 5_151_950, "2026-11-12");
    const next = observeTrackedNinjaAccount(close, 5_303_900, "2026-11-13");
    expect(operationBurnFloor(next, "2026-11-12")).toBe(4_800_000);
    expect(4_879_475).toBeGreaterThan(operationBurnFloor(next, "2026-11-12")!);
    expect(operationBurnFloor(next, "2026-11-13")).toBe(4_951_950);
  });
  it("still detects an actual breach against its contemporaneous floor", () => {
    const next = observeTrackedNinjaAccount(observeTrackedNinjaAccount(initial(), 5_151_950, "2026-11-12"), 4_940_000, "2026-11-13");
    expect(4_940_000).toBeLessThan(operationBurnFloor(next, "2026-11-13")!);
  });
  it("does not invent historical floors for legacy state", () => {
    const legacy = { ...initial(), lastBusinessDate: "2026-11-13", burnFloorInCents: 4_951_950, eodBurnFloors: undefined };
    expect(operationBurnFloor(legacy, "2026-11-12")).toBeNull();
    expect(operationBurnFloor(legacy, "2026-11-13")).toBe(4_951_950);
  });
  it("does not rewind an account or its floor on delayed snapshots", () => {
    const next = observeTrackedNinjaAccount(initial(), 5_100_000, "2026-11-13");
    expect(observeTrackedNinjaAccount(next, 5_000_000, "2026-11-12")).toEqual(next);
  });
});
