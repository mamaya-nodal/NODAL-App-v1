import { describe, expect, it } from "vitest";

import { automaticInstallerPilotEnabled, connectorOnboardingState } from "./connector-onboarding";

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

  it("enables the agreed rollout users and excludes Alfred", () => {
    expect(automaticInstallerPilotEnabled("0c90d147-a048-48c9-8f89-e095bbadc249")).toBe(true);
    expect(automaticInstallerPilotEnabled("2b0f63da-bf32-41ee-86c2-98fb5dbe583b")).toBe(true);
    expect(automaticInstallerPilotEnabled("ffabc050-c33c-47e5-8011-14404e5ee2d5")).toBe(true);
    expect(automaticInstallerPilotEnabled("448eafd0-8158-401a-91fc-5819391b5f4e")).toBe(false);
  });

  it("does not ask a virtual shared destination to install a physical runtime", () => {
    expect(connectorOnboardingState({
      connector: { connectorVersion: "shared-destination", installedSourceVersion: null, status: "active" },
      pilotEnabled: true,
    })).toBe("ready");
  });
});
