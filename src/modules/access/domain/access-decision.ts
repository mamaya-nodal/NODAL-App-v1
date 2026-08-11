export const NODAL_ACCESS_STATES = ["pending", "active", "revoked"] as const;

export type NodalAccessState = (typeof NODAL_ACCESS_STATES)[number];

export type AccessDecision =
  | "allowed"
  | "not_authenticated"
  | "not_authorized"
  | "revoked";

export function decideAccess(
  authenticatedUserId: string | null,
  nodalUser: { id: string; accessState: NodalAccessState } | null,
): AccessDecision {
  if (!authenticatedUserId) {
    return "not_authenticated";
  }

  if (!nodalUser || nodalUser.id !== authenticatedUserId) {
    return "not_authorized";
  }

  if (nodalUser.accessState === "revoked") {
    return "revoked";
  }

  return nodalUser.accessState === "active" ? "allowed" : "not_authorized";
}
