/** Fail closed: a pilot must not schedule work for other installations. */
export function isTelemetryV2Enabled(connectorId: string): boolean {
  if (process.env.NINJA_TELEMETRY_V2_ENABLED !== "true") return false;
  const allowed = (process.env.NINJA_TELEMETRY_V2_CONNECTOR_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  return allowed.includes(connectorId);
}
