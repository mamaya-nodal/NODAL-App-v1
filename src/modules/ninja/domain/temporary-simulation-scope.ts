/** Temporary, explicitly authorized production rehearsal. Remove after reset.
 * Only authenticated intake may stamp this provenance, AFTER normalization.
 * The original account names, balances, executions and physical origin stay intact.
 */
export const TEMPORARY_SIMULATION_START = "2026-11-14T20:45:00Z";
export const TEMPORARY_SIMULATION_END = "2026-11-16T03:00:00Z";
export const TEMPORARY_SIMULATION_CONNECTORS = [
  "4f72f0d2-c11f-4d26-85f7-4116f656c94a", // Mauricio personal
  "ce4c4ef6-306f-4042-983f-85dae86b74ae", // Maxi S
] as const;

export function temporarySimulationRole(
  account: { accountName: string; connectionName: string; nodalTestPhysicalConnectorId?: string },
  observedAt: string,
  authenticatedPhysicalConnectorId?: string,
): "broker" | "prop" | null {
  const physical = authenticatedPhysicalConnectorId ?? account.nodalTestPhysicalConnectorId;
  if (!physical || !TEMPORARY_SIMULATION_CONNECTORS.some((id) => id === physical)) return null;
  const at = Date.parse(observedAt);
  if (!(at >= Date.parse(TEMPORARY_SIMULATION_START) && at < Date.parse(TEMPORARY_SIMULATION_END))) return null;
  const connection = account.connectionName.trim().toLowerCase();
  if (connection !== "simulated data feed" && connection !== "trasmision de datos simulados") return null;
  const name = account.accountName.trim().toUpperCase();
  if (name === "SIM101") return "prop";
  if ((physical === TEMPORARY_SIMULATION_CONNECTORS[0] && name === "SIMBROKER")
    || (physical === TEMPORARY_SIMULATION_CONNECTORS[1] && name === "SIMSIMBROKER")) return "broker";
  return null;
}

export function stampTemporarySimulationAccount<T extends { accountName: string; connectionName: string }>(
  account: T, physicalConnectorId: string, observedAt: string,
): T & { nodalTestPhysicalConnectorId?: string } {
  return temporarySimulationRole(account, observedAt, physicalConnectorId)
    ? { ...account, nodalTestPhysicalConnectorId: physicalConnectorId }
    : account;
}
