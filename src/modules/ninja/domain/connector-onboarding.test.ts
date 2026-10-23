import { describe, expect, it } from "vitest";

import { connectorOnboardingState } from "./connector-onboarding";

describe("automatic connector onboarding", () => {
  it("keeps the normal install gate when no connector exists", () => {
    expect(connectorOnboardingState({ connector: null, pilotEnabled: true })).toBe("install_required");
  });

  it("requires the pilot user to update an active legacy connector", () => {
    expect(connectorOnboardingState({
      connector: { connectorVersion: "0.15", installedSourceVersion: null, status: "active" },
      pilotEnabled: true,
    })).toBe("update_required");
  });

  it("continues only after the new runtime reports its version", () => {
    expect(connectorOnboardingState({
      connector: { connectorVersion: "0.15", installedSourceVersion: "0.16", status: "active" },
      pilotEnabled: true,
    })).toBe("update_required");
    expect(connectorOnboardingState({
      connector: { connectorVersion: "0.16", installedSourceVersion: "0.16", status: "active" },
      pilotEnabled: true,
    })).toBe("ready");
  });

  it("does not force the rollout on users outside the pilot", () => {
    expect(connectorOnboardingState({
      connector: { connectorVersion: "0.15", installedSourceVersion: null, status: "active" },
      pilotEnabled: false,
    })).toBe("ready");
  });
});
