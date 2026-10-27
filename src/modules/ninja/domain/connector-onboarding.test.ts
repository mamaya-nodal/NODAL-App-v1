import { describe, expect, it } from "vitest";

import {
  automaticInstallerEnabled,
  connectorOnboardingState,
  shouldUseSimplifiedOpening,
} from "./connector-onboarding";

describe("automatic connector onboarding", () => {
  it("keeps the normal install gate when no connector exists", () => {
    expect(connectorOnboardingState({ connector: null, automaticInstallerEnabled: true })).toBe("install_required");
  });

  it("requires the pilot user to update an active legacy connector", () => {
    expect(connectorOnboardingState({
      connector: { connectorVersion: "0.15", installedSourceVersion: null, status: "active" },
      automaticInstallerEnabled: true,
    })).toBe("update_required");
  });

  it("continues only after the new runtime reports its version", () => {
    expect(connectorOnboardingState({
      connector: { connectorVersion: "0.15", installedSourceVersion: "0.16", status: "active" },
      automaticInstallerEnabled: true,
    })).toBe("update_required");
    expect(connectorOnboardingState({
      connector: { connectorVersion: "0.16", installedSourceVersion: "0.16", status: "active" },
      automaticInstallerEnabled: true,
    })).toBe("ready");
  });

  it("preserves the legacy connector only for an explicitly excluded user", () => {
    expect(connectorOnboardingState({
      connector: { connectorVersion: "0.15", installedSourceVersion: null, status: "active" },
      automaticInstallerEnabled: false,
    })).toBe("ready");
  });

  it("enables every current and future user except Alfred", () => {
    expect(automaticInstallerEnabled("0c90d147-a048-48c9-8f89-e095bbadc249")).toBe(true);
    expect(automaticInstallerEnabled("ca3dca6d-7ff2-4f92-957d-f3cb2c7553bf")).toBe(true);
    expect(automaticInstallerEnabled("00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(automaticInstallerEnabled("448eafd0-8158-401a-91fc-5819391b5f4e")).toBe(false);
  });

  it("uses the simplified opening for a first opening or an approved edition", () => {
    expect(shouldUseSimplifiedOpening({
      automaticInstallerEnabled: true,
      hasOpeningSnapshot: false,
      openingRevisionApproved: false,
    })).toBe(true);
    expect(shouldUseSimplifiedOpening({
      automaticInstallerEnabled: true,
      hasOpeningSnapshot: true,
      openingRevisionApproved: true,
    })).toBe(true);
    expect(shouldUseSimplifiedOpening({
      automaticInstallerEnabled: true,
      hasOpeningSnapshot: true,
      openingRevisionApproved: false,
    })).toBe(false);
    expect(shouldUseSimplifiedOpening({
      automaticInstallerEnabled: false,
      hasOpeningSnapshot: false,
      openingRevisionApproved: false,
    })).toBe(false);
  });

  it("does not ask a virtual shared destination to install a physical runtime", () => {
    expect(connectorOnboardingState({
      connector: { connectorVersion: "shared-destination", installedSourceVersion: null, status: "active" },
      automaticInstallerEnabled: true,
    })).toBe("ready");
  });
});
