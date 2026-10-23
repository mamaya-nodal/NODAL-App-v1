import { connectorVersionState } from "./connector-version";

const AUTOMATIC_INSTALLER_PILOT_USERS = new Set([
  "0c90d147-a048-48c9-8f89-e095bbadc249", // Julián Agustín Seco
]);

export type ConnectorOnboardingState = "install_required" | "update_required" | "ready";

export function automaticInstallerPilotEnabled(userId: string) {
  return AUTOMATIC_INSTALLER_PILOT_USERS.has(userId);
}

export function connectorOnboardingState(input: Readonly<{
  connector: Readonly<{
    connectorVersion: string | null;
    installedSourceVersion: string | null;
    status: string;
  }> | null;
  pilotEnabled: boolean;
}>): ConnectorOnboardingState {
  if (!input.connector || input.connector.status !== "active") return "install_required";
  if (!input.pilotEnabled) return "ready";
  return connectorVersionState({
    installedSourceVersion: input.connector.installedSourceVersion,
    runningVersion: input.connector.connectorVersion,
  }) === "current" ? "ready" : "update_required";
}
