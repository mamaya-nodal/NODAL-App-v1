import { describe, expect, it } from "vitest";

import { compareMimicalVersions, isConfirmedMimicalVersion, MIMICAL_PRODUCT_KEY, MIMICAL_VERSION } from "./mimical-pilot";

describe("MIMICAL product", () => {
  it("publishes the licensed product and build version", () => {
    expect(MIMICAL_PRODUCT_KEY).toBe("mimical");
    expect(MIMICAL_VERSION).toBe("1.1.0.9");
  });

  it("does not confuse a download with a confirmed DLL version", () => {
    expect(isConfirmedMimicalVersion(null)).toBe(false);
    expect(isConfirmedMimicalVersion("1.1.0.8")).toBe(false);
    expect(isConfirmedMimicalVersion("1.1.0.9")).toBe(true);
    expect(compareMimicalVersions("1.1.0.10", "1.1.0.9")).toBeGreaterThan(0);
  });
});
