import { describe, expect, it } from "vitest";

import { isMasterReportingMonth, MASTER_REPORTING_START_MONTH } from "./master-reporting";

describe("official Admin Master reporting cycle", () => {
  it("excludes history before the approved reset", () => {
    expect(MASTER_REPORTING_START_MONTH).toBe("2026-10-01");
    expect(isMasterReportingMonth("2026-09-01")).toBe(false);
    expect(isMasterReportingMonth("2026-10-01")).toBe(true);
    expect(isMasterReportingMonth("2026-11-01")).toBe(true);
  });
});
