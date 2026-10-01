import { describe, expect, it } from "vitest";

import { periodHasObservations } from "./close-due-periods";

const reconciled = {
  positionDifferenceInCents: 0,
  realizedReconciliationDifferenceInCents: 0,
} as Parameters<typeof periodHasObservations>[0];

describe("cierre de períodos", () => {
  it("cierra sin observaciones cuando ambas conciliaciones están en cero", () => {
    expect(periodHasObservations(reconciled)).toBe(false);
  });

  it("conserva una observación sin impedir el cierre", () => {
    expect(periodHasObservations({
      ...reconciled,
      realizedReconciliationDifferenceInCents: 1,
    })).toBe(true);
  });
});
