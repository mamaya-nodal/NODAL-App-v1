import { describe, expect, it } from "vitest";
import { applyIndividualCommission } from "./individual-commission";
import { buildOperationalSummary } from "./operational-summary";

const empty = buildOperationalSummary({
  accounts: [],
  controls: [],
  entries: [],
  fundingWithdrawals: [],
  phaseWithdrawals: [],
  walletMovements: [],
});
describe("individual commission agreement", () => {
  it("keeps the historical rule when no agreement exists", () => {
    expect(applyIndividualCommission(empty, null)).toBe(empty);
  });
  it("uses the individual rate without legacy tiers or caps", () => {
    const result = applyIndividualCommission(
      { ...empty, realizedGainInCents: 10_000_000 },
      3000,
    );
    expect(result.commissionInCents).toBe(3_000_000);
    expect(result.traderGainInCents).toBe(7_000_000);
  });
  it("does not charge commission on negative results", () => {
    expect(
      applyIndividualCommission({ ...empty, realizedGainInCents: -10000 }, 3000)
        .commissionInCents,
    ).toBe(0);
  });
});
