import { describe, expect, it } from "vitest";

import {
  augustDemo,
  calculatedAccountResult,
  currentDemoBrokerCoverage,
  demoAccounts,
  demoCapitalHistory,
  demoHomeDashboard,
  julyDemo,
  currentDemoOperations,
} from "./demo-fixture";

describe("accounting demo fixture", () => {
  it("uses the real commission and reconciliation rules for August", () => {
    expect(augustDemo.summary).toMatchObject({
      accountStates: { closed: 16, live: 8, virgin: 1 },
      accumulatedResultInCents: 2_054_601,
      brokerBalanceInCents: 2_577_601,
      capitalNetInCents: 1_063_000,
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
      walletBalanceInCents: 360_000,
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
      { capitalInCents: 1_063_000, periodMonth: "2026-08-01" },
    ]);
  });

  it("represents simultaneous activity as five independent account operations", () => {
    expect(currentDemoOperations).toHaveLength(5);
    expect(new Set(currentDemoOperations.map((operation) => operation.accountId)).size).toBe(5);
    expect(currentDemoOperations.every((operation) => operation.netLiquidationInCents !== operation.cashValueInCents)).toBe(true);
    expect(currentDemoOperations.every((operation) => operation.direction === "Long" && operation.quantity === 1)).toBe(true);
    expect(currentDemoBrokerCoverage).toMatchObject({ direction: "Short", quantity: 5 });
    expect(currentDemoOperations.reduce((total, operation) => total + operation.cashValueInCents - operation.netLiquidationInCents, 0)).toBe(
      currentDemoBrokerCoverage.netLiquidationInCents - currentDemoBrokerCoverage.cashValueInCents,
    );
  });

  it("builds the dashboard income from own operations and desk administration", () => {
    expect(demoHomeDashboard.earnings).toEqual({
      deskAdministrationInCents: 1_785_000,
      level: 2,
      ownOperationsInCents: 600_000,
      totalInCents: 2_385_000,
    });
    expect(demoHomeDashboard.billingInCents).toBe(1_200_000);
    expect(demoHomeDashboard.history).toEqual([
      { billingInCents: 1_050_000, earningsInCents: 1_953_000, periodMonth: "2026-07-01" },
      { billingInCents: 1_200_000, earningsInCents: 2_385_000, periodMonth: "2026-08-01" },
    ]);
    expect(demoHomeDashboard.capabilities?.managedDesk?.billingInCents).toBe(3_000_000);
    expect(demoHomeDashboard.capabilities?.identities?.payoutTotalInCents).toBe(2_500_000);
  });
});
