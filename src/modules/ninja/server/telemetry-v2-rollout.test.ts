import { afterEach, describe, expect, it, vi } from "vitest";
import { isTelemetryV2Enabled } from "./telemetry-v2-rollout";
afterEach(() => vi.unstubAllEnvs());
describe("isolated telemetry pilot", () => {
  it("enables only the explicit installation", () => {
    vi.stubEnv("NINJA_TELEMETRY_V2_ENABLED", "true");
    vi.stubEnv("NINJA_TELEMETRY_V2_CONNECTOR_IDS", " pilot ,second ");
    expect(isTelemetryV2Enabled("pilot")).toBe(true);
    expect(isTelemetryV2Enabled("other")).toBe(false);
  });
  it("defaults to disabled for absent list, wildcard and disabled flag", () => {
    vi.stubEnv("NINJA_TELEMETRY_V2_ENABLED", "true");
    vi.stubEnv("NINJA_TELEMETRY_V2_CONNECTOR_IDS", "");
    expect(isTelemetryV2Enabled("pilot")).toBe(false);
    vi.stubEnv("NINJA_TELEMETRY_V2_CONNECTOR_IDS", "*");
    expect(isTelemetryV2Enabled("pilot")).toBe(false);
    vi.stubEnv("NINJA_TELEMETRY_V2_CONNECTOR_IDS", "pilot");
    vi.stubEnv("NINJA_TELEMETRY_V2_ENABLED", "false");
    expect(isTelemetryV2Enabled("pilot")).toBe(false);
  });
});
