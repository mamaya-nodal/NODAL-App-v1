import { describe, expect, it } from "vitest";

import { canApprovePeriodClosure } from "./period-close-approval";

describe("aprobación de cierres", () => {
  it("permite aprobar una versión cerrada y todavía pendiente", () => {
    expect(canApprovePeriodClosure({ approved: false, hasResolvedObservation: false, status: "closed" })).toBe(true);
  });

  it("exige resolver una observación antes de aprobar", () => {
    expect(canApprovePeriodClosure({ approved: false, hasResolvedObservation: false, status: "closed_with_observations" })).toBe(false);
    expect(canApprovePeriodClosure({ approved: false, hasResolvedObservation: true, status: "closed_with_observations" })).toBe(true);
  });

  it("no vuelve a aprobar una misma versión", () => {
    expect(canApprovePeriodClosure({ approved: true, hasResolvedObservation: true, status: "rectified" })).toBe(false);
  });
});
