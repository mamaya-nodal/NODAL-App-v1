export const MIMICAL_PRODUCT_KEY = "mimical";
export const MIMICAL_VERSION = "1.1.0";

// Piloto deliberadamente limitado. Ampliarlo requiere una decisión de Producto,
// no alcanza con que el componente exista o que el usuario conozca la URL.
const MIMICAL_PILOT_USERS = new Set([
  "0c90d147-a048-48c9-8f89-e095bbadc249", // Julian Agustin Seco
  "f2f5f816-ec4f-46e1-b216-5267aeadc635", // Mauricio Amaya
]);

export function mimicalPilotEnabled(userId: string) {
  return MIMICAL_PILOT_USERS.has(userId);
}

export type MimicalContext = Readonly<{
  identityId: string | null;
  ownerUserId: string;
}>;

export function canUseMimicalPilot(context: MimicalContext) {
  return mimicalPilotEnabled(context.ownerUserId);
}
