import { describe, expect, it } from "vitest";

import {
  buildPeriodEarnings,
  payoutDashboardSummary,
} from "./personal-dashboard";

describe("personal dashboard", () => {
  it("adds only the income streams enabled for the user", () => {
    expect(buildPeriodEarnings({
      deskAdministrationInCents: 105_000,
      level: 2,
      ownOperationsInCents: 600_000,
      referredDesksInCents: 5_250,
    })).toEqual({
      deskAdministrationInCents: 105_000,
      level: 2,
      ownOperationsInCents: 600_000,
      referredDesksInCents: 5_250,
      totalInCents: 710_250,
    });
    expect(buildPeriodEarnings({ ownOperationsInCents: 525_000 }).totalInCents).toBe(525_000);
  });

  it("shows payout count, total and pending count separately", () => {
    expect(payoutDashboardSummary([
      { accountId: "a", amountInCents: 180_000, approvedOn: "2026-08-01", collectedOn: "2026-08-02", id: "one" },
      { accountId: "b", amountInCents: 180_000, approvedOn: "2026-08-03", collectedOn: null, id: "two" },
    ])).toEqual({ count: 2, pendingCount: 1, totalInCents: 360_000 });
  });
});
