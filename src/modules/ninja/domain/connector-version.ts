export const LATEST_NINJA_CONNECTOR_VERSION = "0.15";
export const CANDIDATE_NINJA_CONNECTOR_VERSION = "0.15";

export type ConnectorVersionState =
  | "current"
  | "pending_activation"
  | "update_available"
  | "unknown";

function atLeast(version: string | null, target: string): boolean {
  if (!version || !/^\d+(\.\d+)*$/.test(version) || !/^\d+(\.\d+)*$/.test(target)) return false;
  const left = version.split(".").map(Number);
  const right = target.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

export function connectorVersionState(input: Readonly<{
  installedSourceVersion: string | null;
  latestVersion?: string;
  runningVersion: string | null;
}>): ConnectorVersionState {
  const latestVersion = input.latestVersion ?? LATEST_NINJA_CONNECTOR_VERSION;
  // A newer pilot must never be offered a downgrade to the public ZIP.
  if (atLeast(input.runningVersion, latestVersion)) return "current";
  if (atLeast(input.installedSourceVersion, latestVersion)) return "pending_activation";
  if (input.runningVersion || input.installedSourceVersion) return "update_available";
  return "unknown";
}
