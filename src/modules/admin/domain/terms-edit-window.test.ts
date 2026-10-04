import { describe, expect, it } from "vitest";

import { canEditDeskTerms } from "./terms-edit-window";

const closedAt = "2026-10-02T22:00:00.000Z";

describe("desk terms edit window", () => {
  it("allows desk managers only during the first 48 hours after closing", () => {
    expect(canEditDeskTerms({
      actorIsMaster: false,
      previousPeriodClosedAt: closedAt,
      now: new Date("2026-10-04T21:59:59.999Z"),
      targetIsNewUser: false,
    })).toBe(true);

    expect(canEditDeskTerms({
      actorIsMaster: false,
      previousPeriodClosedAt: closedAt,
      now: new Date("2026-10-04T22:00:00.000Z"),
      targetIsNewUser: false,
    })).toBe(false);
  });

  it("keeps creation and Admin Master as explicit exceptions", () => {
    const afterWindow = new Date("2026-10-20T12:00:00.000Z");
    expect(canEditDeskTerms({
      actorIsMaster: false,
      previousPeriodClosedAt: closedAt,
      now: afterWindow,
      targetIsNewUser: true,
    })).toBe(true);
    expect(canEditDeskTerms({
      actorIsMaster: true,
      previousPeriodClosedAt: closedAt,
      now: afterWindow,
      targetIsNewUser: false,
    })).toBe(true);
  });

  it("rejects an invalid or future closing for desk managers", () => {
    expect(canEditDeskTerms({
      actorIsMaster: false,
      previousPeriodClosedAt: null,
      now: new Date("2026-10-03T12:00:00.000Z"),
      targetIsNewUser: false,
    })).toBe(false);
    expect(canEditDeskTerms({
      actorIsMaster: false,
      previousPeriodClosedAt: "2026-10-05T12:00:00.000Z",
      now: new Date("2026-10-03T12:00:00.000Z"),
      targetIsNewUser: false,
    })).toBe(false);
  });
});

