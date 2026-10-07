export const LATEST_NINJA_CONNECTOR_VERSION = "0.11";
// Candidate source is not the published download until isolated QA and rollout approval.
export const CANDIDATE_NINJA_CONNECTOR_VERSION = "0.12";

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
