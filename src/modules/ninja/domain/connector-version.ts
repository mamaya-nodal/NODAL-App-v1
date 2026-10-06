export const LATEST_NINJA_CONNECTOR_VERSION = "0.11";

export type ConnectorVersionState =
  | "current"
  | "pending_activation"
  | "update_available"
  | "unknown";

export function connectorVersionState(input: Readonly<{
  installedSourceVersion: string | null;
  latestVersion?: string;
  runningVersion: string | null;
}>): ConnectorVersionState {
  const latestVersion = input.latestVersion ?? LATEST_NINJA_CONNECTOR_VERSION;
  if (input.runningVersion === latestVersion) return "current";
  if (input.installedSourceVersion === latestVersion) return "pending_activation";
  if (input.runningVersion || input.installedSourceVersion) return "update_available";
  return "unknown";
}
