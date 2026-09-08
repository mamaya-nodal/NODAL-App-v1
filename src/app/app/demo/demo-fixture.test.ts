import { describe, expect, it } from "vitest";

import {
  augustDemo,
  calculatedAccountResult,
  demoAccounts,
  demoCapitalHistory,
  demoHomeDashboard,
  julyDemo,
} from "./demo-fixture";

describe("accounting demo fixture", () => {
  it("uses the real commission and reconciliation rules for August", () => {
    expect(augustDemo.summary).toMatchObject({
      accountStates: { closed: 16, live: 8, virgin: 1 },
      brokerBalanceInCents: 797_501,
      capitalNetInCents: 498_000,
      commissionInCents: 427_450,
      commissionRateLabel: "50% · acuerdo individual",
      floatingInCents: 184_879,
      fundingCollectedInCents: 180_000,
      fundingPendingInCents: 180_000,
      periodResultInCents: 659_501,
      positionDifferenceInCents: 0,
      realizedGainInCents: 854_900,
      realizedReconciliationDifferenceInCents: 0,
      traderGainInCents: 427_450,
      virginPriceInCents: 10_520,
      walletBalanceInCents: 180_000,
    });
  });

  it("closes July with the same 50 percent individual agreement", () => {
    expect(julyDemo.summary).toMatchObject({
      accountStates: { closed: 18, live: 0, virgin: 0 },
      brokerBalanceInCents: 572_600,
      capitalNetInCents: 426_200,
      commissionInCents: 163_200,
      floatingInCents: 0,
      fundingCollectedInCents: 180_000,
      fundingPendingInCents: 0,
      periodResultInCents: 326_400,
      positionDifferenceInCents: 0,
      realizedGainInCents: 326_400,
      realizedReconciliationDifferenceInCents: 0,
      traderGainInCents: 163_200,
    });
  });

  it("derives every visible account result from its register entries", () => {
    for (const period of [julyDemo, augustDemo]) {
      for (const account of period.accounts) {
        const calculated = account.state === "virgin" ? 0 : calculatedAccountResult(account, period);
        expect(calculated).toBe(account.resultInCents);
      }
    }
  });

  it("contains two periods, 43 accounts and exactly 79 operations", () => {
    expect(demoAccounts).toHaveLength(43);
    expect(julyDemo.controls.filter((control) => control.operatingResultInCents !== null)).toHaveLength(31);
    expect(augustDemo.controls.filter((control) => control.operatingResultInCents !== null)).toHaveLength(48);
    expect(demoCapitalHistory).toEqual([
      { capitalInCents: 426_200, periodMonth: "2026-07-01" },
      { capitalInCents: 924_200, periodMonth: "2026-08-01" },
    ]);
  });

  it("builds the dashboard income from own operations, desk administration and direct referrals", () => {
    expect(demoHomeDashboard.earnings).toEqual({
      deskAdministrationInCents: 210_000,
      level: 2,
      ownOperationsInCents: 427_450,
      referredDesksInCents: 52_500,
      totalInCents: 689_950,
    });
    expect(demoHomeDashboard.closedCapitalInCents).toBe(168_320);
    expect(demoHomeDashboard.history).toEqual([
      { closedCapitalInCents: 189_360, earningsInCents: 294_450, periodMonth: "2026-07-01" },
      { closedCapitalInCents: 168_320, earningsInCents: 689_950, periodMonth: "2026-08-01" },
    ]);
    expect(demoHomeDashboard.capabilities?.referredDesks).toMatchObject({ bonusBps: 1_500, desks: 2 });
  });
});
