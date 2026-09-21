import { describe, expect, it } from "vitest";

import { operationalOpeningFromRecord, type PeriodOpeningRecord } from "./opening-snapshot";

const base: PeriodOpeningRecord = {
  batches: [], brokerBalanceInCents: 1_000_000, closedAccountsReference: 7,
  contributedCapitalInCents: 1_500_000, cutoverDate: "2026-09-21", floatingInCents: -120_000,
  fundedAccounts: 2, fundingPendingInCents: 50_000, id: "opening", liveEvaluationAccounts: 3,
  mode: "reconstruct", personalWithdrawalsInCents: 200_000, priorRealizedResultInCents: 70_000,
  virginAccounts: 1, walletBalanceInCents: 300_000,
};

describe("period opening snapshot", () => {
  it("reconstructs capital, progress and account references without creating trades", () => {
    expect(operationalOpeningFromRecord(base)).toEqual({
      accountStates: { closed: 7, live: 5, virgin: 1 },
      accumulatedResultInCents: -50_000,
      brokerBalanceInCents: 1_000_000,
      capitalNetInCents: 1_300_000,
      floatingInCents: 120_000,
      fundingPendingInCents: 50_000,
      walletBalanceInCents: 300_000,
    });
  });

  it("treats a starting wallet balance as trader capital when the cycle starts from zero", () => {
    expect(operationalOpeningFromRecord({
      ...base, mode: "zero", contributedCapitalInCents: 200_000,
      personalWithdrawalsInCents: 0, walletBalanceInCents: 300_000,
    }).capitalNetInCents).toBe(500_000);
  });
});
