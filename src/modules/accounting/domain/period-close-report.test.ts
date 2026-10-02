import { describe, expect, it } from "vitest";

import { splitDeskMemberBilling } from "./period-close-report";

describe("period close report desk split", () => {
  it("represents the habitual 50/30/20 split", () => {
    expect(splitDeskMemberBilling({
      billedInCents: 4_000_000,
      generatedCommissionBps: 5_000,
      nodalShareOfCommissionBps: 4_000,
    })).toEqual({
      administratorBps: 3_000,
      administratorCommissionInCents: 1_200_000,
      memberBps: 5_000,
      memberCommissionInCents: 2_000_000,
      nodalBps: 2_000,
      nodalCommissionInCents: 800_000,
    });
  });

  it("represents the habitual 50/35/15 split", () => {
    expect(splitDeskMemberBilling({
      billedInCents: 4_000_000,
      generatedCommissionBps: 5_000,
      nodalShareOfCommissionBps: 3_000,
    })).toEqual({
      administratorBps: 3_500,
      administratorCommissionInCents: 1_400_000,
      memberBps: 5_000,
      memberCommissionInCents: 2_000_000,
      nodalBps: 1_500,
      nodalCommissionInCents: 600_000,
    });
  });
});
