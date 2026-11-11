import { describe, expect, it } from "vitest";

import {
  compareMimicalVersions,
  isConfirmedMimicalVersion,
  MIMICAL_PRODUCT_KEY,
  MIMICAL_VERSION,
} from "./mimical-pilot";

describe("MIMICAL product", () => {
  it("publishes the licensed product and build version", () => {
    expect(MIMICAL_PRODUCT_KEY).toBe("mimical");
    expect(MIMICAL_VERSION).toBe("1.1.0.8");
  });

  it("confirms the published version or any later version", () => {
    expect(isConfirmedMimicalVersion("1.1.0.7")).toBe(false);
    expect(isConfirmedMimicalVersion("1.1.0.8")).toBe(true);
    expect(isConfirmedMimicalVersion("1.1.1.0")).toBe(true);
    expect(compareMimicalVersions("1.1.0.10", "1.1.0.8")).toBeGreaterThan(0);
  });
});
