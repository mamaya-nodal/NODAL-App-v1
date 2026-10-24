import { connectorVersionState } from "./connector-version";

const AUTOMATIC_INSTALLER_ROLLOUT_USERS = new Set([
  "dea5c2b6-5eaa-4fca-862e-e0c754dcb29a", // Alejandro Ivan Oyola Perez
  "42c42ea2-c9a9-41c6-8604-5804982c1f50", // Baltazar Almiron
  "b1afb804-fb3f-4424-b9ab-5e0e0b0ec887", // David Johel Zabaleta Mallqui
  "e70a9f26-86ce-42b6-b62c-827c63981254", // Ivo Pirrone
  "b3a19ab3-4f07-4045-adea-66623af2a057", // Javier Torales
  "6173ce21-48bc-47a5-8a0a-10c6c44111e7", // Juan Carlos Sanchez
  "0c90d147-a048-48c9-8f89-e095bbadc249", // Julian Agustin Seco
  "718dd3b8-ccdf-4987-9716-dacb2c10a103", // Leonardo Kenig
  "2b0f63da-bf32-41ee-86c2-98fb5dbe583b", // Lorena Mariel Malagreca
  "f2f5f816-ec4f-46e1-b216-5267aeadc635", // Mauricio Amaya
  "07e71363-9aeb-424b-aa91-0b20c16361f6", // Nicolas
  "ffabc050-c33c-47e5-8011-14404e5ee2d5", // Sebastian Bonincontro
]);

export type ConnectorOnboardingState = "install_required" | "update_required" | "ready";

export function automaticInstallerPilotEnabled(userId: string) {
  return AUTOMATIC_INSTALLER_ROLLOUT_USERS.has(userId);
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
  if (input.connector.connectorVersion === "shared-destination") return "ready";
  return connectorVersionState({
    installedSourceVersion: input.connector.installedSourceVersion,
    runningVersion: input.connector.connectorVersion,
  }) === "current" ? "ready" : "update_required";
}
