import { afterEach, describe, expect, it, vi } from "vitest";
import { isTelemetryV2Enabled } from "./telemetry-v2-rollout";
afterEach(() => vi.unstubAllEnvs());
describe("telemetry v2 rollout", () => {
  it("enables only the explicit installation", () => {
    vi.stubEnv("NINJA_TELEMETRY_V2_ENABLED", "true");
    vi.stubEnv("NINJA_TELEMETRY_V2_CONNECTOR_IDS", " pilot ,second ");
    expect(isTelemetryV2Enabled("pilot")).toBe(true);
    expect(isTelemetryV2Enabled("other")).toBe(false);
  });
  it("enables every authenticated installation only with the explicit production flag", () => {
    vi.stubEnv("NINJA_TELEMETRY_V2_ENABLED", "true");
    vi.stubEnv("NINJA_TELEMETRY_V2_ALL_CONNECTORS", "true");
    expect(isTelemetryV2Enabled("pilot")).toBe(true);
    expect(isTelemetryV2Enabled("another-installation")).toBe(true);
  });
  it("defaults to disabled for absent list, wildcard and disabled flag", () => {
    vi.stubEnv("NINJA_TELEMETRY_V2_ENABLED", "true");
    vi.stubEnv("NINJA_TELEMETRY_V2_CONNECTOR_IDS", "");
    expect(isTelemetryV2Enabled("pilot")).toBe(false);
    vi.stubEnv("NINJA_TELEMETRY_V2_CONNECTOR_IDS", "*");
    expect(isTelemetryV2Enabled("pilot")).toBe(false);
    vi.stubEnv("NINJA_TELEMETRY_V2_CONNECTOR_IDS", "pilot");
    vi.stubEnv("NINJA_TELEMETRY_V2_ENABLED", "false");
    vi.stubEnv("NINJA_TELEMETRY_V2_ALL_CONNECTORS", "true");
    expect(isTelemetryV2Enabled("pilot")).toBe(false);
  });
});
