export const NODAL_AGENT_PILOT_EMAIL = "mauriciosebastianamaya@gmail.com";

export function canUseNodalAgentPilot(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === NODAL_AGENT_PILOT_EMAIL;
}
