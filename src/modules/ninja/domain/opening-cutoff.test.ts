import { describe, expect, it } from "vitest";

import { happenedAfterOpening, observedAfterOpening, openingCutoffTimestamp } from "./opening-cutoff";

describe("Ninja telemetry opening cutoff", () => {
  it("uses the latest confirmed opening revision as the effective cutoff", () => {
    expect(openingCutoffTimestamp({
      created_at: "2026-10-09T12:57:52.339Z",
      updated_at: "2026-10-27T14:18:57.234Z",
    })).toBe("2026-10-27T14:18:57.234Z");
  });

  it("hides reconciliation batches from before the new opening", () => {
    const rows = [
      { id: "old", opened_at: "2026-10-15T14:29:57.747Z" },
      { id: "new", opened_at: "2026-10-27T14:19:00.000Z" },
    ];
    expect(happenedAfterOpening(rows, "2026-10-27T14:18:57.234Z").map((row) => row.id)).toEqual(["new"]);
  });

  it("applies the same cutoff to raw telemetry events", () => {
    const rows = [
      { id: "old", occurred_at: "2026-10-14T14:00:00.000Z" },
      { id: "new", occurred_at: "2026-10-27T15:00:00.000Z" },
    ];
    expect(observedAfterOpening(rows, "2026-10-27T14:18:57.234Z").map((row) => row.id)).toEqual(["new"]);
  });
});
