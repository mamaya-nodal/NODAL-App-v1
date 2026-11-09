export const NODAL_AGENT_PILOT_EMAILS = [
  "mauriciosebastianamaya@gmail.com",
  "loremalagreca@gmail.com",
  "david.zabaleta.1999@gmail.com",
] as const;

export function canUseNodalAgentPilot(email: string | null | undefined): boolean {
  const normalizedEmail = email?.trim().toLowerCase();
  return normalizedEmail ? NODAL_AGENT_PILOT_EMAILS.includes(normalizedEmail as typeof NODAL_AGENT_PILOT_EMAILS[number]) : false;
}
