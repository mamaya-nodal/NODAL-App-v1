import { describe, expect, it } from "vitest";

import {
  buildPeriodEarnings,
  payoutDashboardSummary,
} from "./personal-dashboard";

describe("personal dashboard", () => {
  it("adds own operations and desk administration", () => {
    expect(buildPeriodEarnings({
      deskAdministrationInCents: 1_050_000,
      level: 2,
      ownOperationsInCents: 600_000,
    })).toEqual({
      deskAdministrationInCents: 1_050_000,
      level: 2,
      ownOperationsInCents: 600_000,
      totalInCents: 1_650_000,
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
