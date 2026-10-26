import { describe, expect, it } from "vitest";

import { shouldReloadForNinjaStatus } from "./ninja-connector-monitor";

describe("Ninja connector monitor refresh", () => {
  it("refreshes the opening when an identity inventory changes", () => {
    expect(shouldReloadForNinjaStatus({
      connectionChanged: false,
      inventoryChanged: true,
      refreshOnConnectionChange: false,
    })).toBe(true);
  });

  it("can suppress connection-only refreshes while the opening form is active", () => {
    expect(shouldReloadForNinjaStatus({
      connectionChanged: true,
      inventoryChanged: false,
      refreshOnConnectionChange: false,
    })).toBe(false);
  });
});
