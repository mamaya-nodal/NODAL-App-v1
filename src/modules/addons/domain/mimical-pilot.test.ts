import { describe, expect, it } from "vitest";

import { MIMICAL_PRODUCT_KEY, MIMICAL_VERSION } from "./mimical-pilot";

describe("MIMICAL product", () => {
  it("publishes the licensed product and build version", () => {
    expect(MIMICAL_PRODUCT_KEY).toBe("mimical");
    expect(MIMICAL_VERSION).toBe("1.1.0.1");
  });
});
