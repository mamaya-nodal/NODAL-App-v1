import { describe, expect, it } from "vitest";

import { buildAdminStudentOverview, summarizeAdminOverview } from "./admin-overview";
import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";

const summary = (gain: number, commission = 0): OperationalSummary => ({
  accumulatedResultInCents: 0,
  accountStates: { closed: 0, live: 0, virgin: 0 }, brokerBalanceInCents: 0,
  capitalNetInCents: 20_000, commissionInCents: commission, commissionRateLabel: "50% (tope US$ 4.400)",
  floatingInCents: 0, fundingCollectedInCents: 0, fundingPendingInCents: 0, fundingWithdrawals: [],
  manualAccountStateCount: 0, periodResultInCents: 0, positionDifferenceInCents: 0,
  positionExpectedInCents: 0, positionObservableInCents: 0, realizedGainInCents: gain,
  realizedReconciliationDifferenceInCents: 0, traderGainInCents: gain - commission,
  virginPriceInCents: 0, walletBalanceInCents: 0, walletMovements: [],
});

describe("admin overview", () => {
  it("shows activity and outcome without mixing them", () => {
    const student = buildAdminStudentOverview({ email: "lore@example.com", id: "lore", lastOperatedOn: "2026-08-14", name: "Lore", summary: summary(12_500, 6_250) }, "2026-08-15");
    expect(student.activityLabel).toBe("Operó ayer");
    expect(student.performanceLabel).toBe("Viene ganando");
    expect(student.capitalInCents).toBe(20_000);
  });

  it("marks an old operation as inactive and totals only the visible commission", () => {
    const inactive = buildAdminStudentOverview({ email: "a@example.com", id: "a", lastOperatedOn: "2026-08-10", name: null, summary: summary(-100, 0) }, "2026-08-15");
    const active = buildAdminStudentOverview({ email: "b@example.com", id: "b", lastOperatedOn: "2026-08-15", name: "B", summary: summary(900, 450) }, "2026-08-15");
    expect(inactive.activityState).toBe("inactive");
    expect(inactive.performanceState).toBe("losing");
    expect(summarizeAdminOverview([inactive, active])).toEqual({ activeRecently: 1, totalCommissionInCents: 450, totalStudents: 2, winningStudents: 1 });
  });
});
