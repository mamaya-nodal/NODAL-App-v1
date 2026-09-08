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
      brokerBalanceInCents: 1_644_601,
      capitalNetInCents: 1_000_000,
      commissionInCents: 600_000,
      commissionRateLabel: "50% · acuerdo individual",
      floatingInCents: 184_879,
      fundingCollectedInCents: 180_000,
      fundingPendingInCents: 180_000,
      periodResultInCents: 1_004_601,
      positionDifferenceInCents: 0,
      realizedGainInCents: 1_200_000,
      realizedReconciliationDifferenceInCents: 0,
      traderGainInCents: 600_000,
      virginPriceInCents: 10_520,
      walletBalanceInCents: 180_000,
    });
  });

  it("closes July with the same 50 percent individual agreement", () => {
    expect(julyDemo.summary).toMatchObject({
      accountStates: { closed: 18, live: 0, virgin: 0 },
      brokerBalanceInCents: 1_670_000,
      capitalNetInCents: 800_000,
      commissionInCents: 525_000,
      floatingInCents: 0,
      fundingCollectedInCents: 180_000,
      fundingPendingInCents: 0,
      periodResultInCents: 1_050_000,
      positionDifferenceInCents: 0,
      realizedGainInCents: 1_050_000,
      realizedReconciliationDifferenceInCents: 0,
      traderGainInCents: 525_000,
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
      { capitalInCents: 800_000, periodMonth: "2026-07-01" },
      { capitalInCents: 1_800_000, periodMonth: "2026-08-01" },
    ]);
  });

  it("builds the dashboard income from own operations, desk administration and direct referrals", () => {
    expect(demoHomeDashboard.earnings).toEqual({
      deskAdministrationInCents: 105_000,
      level: 2,
      ownOperationsInCents: 600_000,
      referredDesksInCents: 5_250,
      totalInCents: 710_250,
    });
    expect(demoHomeDashboard.capitalNetInCents).toBe(1_000_000);
    expect(demoHomeDashboard.history).toEqual([
      { capitalNetInCents: 800_000, earningsInCents: 613_200, periodMonth: "2026-07-01" },
      { capitalNetInCents: 1_000_000, earningsInCents: 710_250, periodMonth: "2026-08-01" },
    ]);
    expect(demoHomeDashboard.capabilities?.referredDesks).toMatchObject({ bonusBps: 1_500, desks: 2 });
    expect(demoHomeDashboard.capabilities?.managedDesk?.capitalNetInCents).toBe(600_000);
    expect(demoHomeDashboard.capabilities?.identities?.payoutTotalInCents).toBe(600_000);
  });
});
