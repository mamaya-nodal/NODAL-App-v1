import { describe, expect, it } from "vitest";

import { transmittedWithinLast24Hours } from "./connector-activity";

describe("connector activity", () => {
  const now = new Date("2026-10-04T18:00:00.000Z");

  it("considers a connector active when it transmitted within 24 hours", () => {
    expect(transmittedWithinLast24Hours("2026-10-03T18:00:00.000Z", now)).toBe(true);
    expect(transmittedWithinLast24Hours("2026-10-04T17:59:00.000Z", now)).toBe(true);
  });

  it("considers missing, future or older signals inactive", () => {
    expect(transmittedWithinLast24Hours(null, now)).toBe(false);
    expect(transmittedWithinLast24Hours("2026-10-03T17:59:59.999Z", now)).toBe(false);
    expect(transmittedWithinLast24Hours("2026-10-04T18:00:01.000Z", now)).toBe(false);
  });
});
