import { describe, expect, it } from "vitest";

import { canUseMimicalPilot, MIMICAL_VERSION, mimicalPilotEnabled } from "./mimical-pilot";

describe("MIMICAL pilot", () => {
  it("enables Julian, Mauricio and Lorena during the pilot", () => {
    expect(mimicalPilotEnabled("0c90d147-a048-48c9-8f89-e095bbadc249")).toBe(true);
    expect(mimicalPilotEnabled("f2f5f816-ec4f-46e1-b216-5267aeadc635")).toBe(true);
    expect(mimicalPilotEnabled("2b0f63da-bf32-41ee-86c2-98fb5dbe583b")).toBe(true);
    expect(mimicalPilotEnabled("00000000-0000-0000-0000-000000000001")).toBe(false);
  });

  it("uses the same entitlement rule for personal and identity contexts", () => {
    expect(canUseMimicalPilot({ ownerUserId: "0c90d147-a048-48c9-8f89-e095bbadc249", identityId: null })).toBe(true);
    expect(canUseMimicalPilot({ ownerUserId: "0c90d147-a048-48c9-8f89-e095bbadc249", identityId: "identity" })).toBe(true);
  });

  it("publishes the licensed build version", () => {
    expect(MIMICAL_VERSION).toBe("1.1.0");
  });
});
