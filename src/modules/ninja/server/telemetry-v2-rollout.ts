/** Fail closed unless the production-wide rollout was explicitly enabled. */
export function isTelemetryV2Enabled(connectorId: string): boolean {
  if (process.env.NINJA_TELEMETRY_V2_ENABLED !== "true") return false;
  if (process.env.NINJA_TELEMETRY_V2_ALL_CONNECTORS === "true") return true;
  const allowed = (process.env.NINJA_TELEMETRY_V2_CONNECTOR_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  return allowed.includes(connectorId);
}
