import { describe, expect, it } from "vitest";

import {
  buildPeriodEarnings,
  closedAccountCapital,
  payoutDashboardSummary,
} from "./personal-dashboard";

describe("personal dashboard", () => {
  it("adds only the income streams enabled for the user", () => {
    expect(buildPeriodEarnings({
      deskAdministrationInCents: 210_000,
      level: 2,
      ownOperationsInCents: 427_450,
      referredDesksInCents: 52_500,
    })).toEqual({
      deskAdministrationInCents: 210_000,
      level: 2,
      ownOperationsInCents: 427_450,
      referredDesksInCents: 52_500,
      totalInCents: 689_950,
    });
    expect(buildPeriodEarnings({ ownOperationsInCents: 163_200 }).totalInCents).toBe(163_200);
  });

  it("counts personal capital only from closed accounts", () => {
    expect(closedAccountCapital([
      { fundsOrigin: "Aporte trader", id: "closed-own", priceInCents: 10_000, state: "closed", stateOrigin: "automatic" },
      { fundsOrigin: "Aporte trader", id: "live-own", priceInCents: 20_000, state: "live", stateOrigin: "automatic" },
      { fundsOrigin: "Saldo generado", id: "closed-generated", priceInCents: 30_000, state: "closed", stateOrigin: "automatic" },
    ])).toBe(10_000);
  });

  it("shows payout count, total and pending count separately", () => {
    expect(payoutDashboardSummary([
      { accountId: "a", amountInCents: 180_000, approvedOn: "2026-08-01", collectedOn: "2026-08-02", id: "one" },
      { accountId: "b", amountInCents: 180_000, approvedOn: "2026-08-03", collectedOn: null, id: "two" },
    ])).toEqual({ count: 2, pendingCount: 1, totalInCents: 360_000 });
  });
});
