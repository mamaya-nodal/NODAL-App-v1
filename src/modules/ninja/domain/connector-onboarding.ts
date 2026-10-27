import { connectorVersionState } from "./connector-version";

const LEGACY_CONNECTOR_USERS = new Set([
  "448eafd0-8158-401a-91fc-5819391b5f4e", // Alfred: conserva el flujo anterior.
]);

export type ConnectorOnboardingState = "install_required" | "update_required" | "ready";

export function automaticInstallerEnabled(userId: string) {
  return !LEGACY_CONNECTOR_USERS.has(userId);
}

export function shouldUseSimplifiedOpening(input: Readonly<{
  automaticInstallerEnabled: boolean;
  hasOpeningSnapshot: boolean;
  openingRevisionApproved: boolean;
}>) {
  return input.automaticInstallerEnabled
    && (!input.hasOpeningSnapshot || input.openingRevisionApproved);
}

export function connectorOnboardingState(input: Readonly<{
  connector: Readonly<{
    connectorVersion: string | null;
    installedSourceVersion: string | null;
    status: string;
  }> | null;
  automaticInstallerEnabled: boolean;
}>): ConnectorOnboardingState {
  if (!input.connector || input.connector.status !== "active") return "install_required";
  if (!input.automaticInstallerEnabled) return "ready";
  if (input.connector.connectorVersion === "shared-destination") return "ready";
  return connectorVersionState({
    installedSourceVersion: input.connector.installedSourceVersion,
    runningVersion: input.connector.connectorVersion,
  }) === "current" ? "ready" : "update_required";
}
