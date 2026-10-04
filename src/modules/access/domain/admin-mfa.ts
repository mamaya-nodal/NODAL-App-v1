export function hasVerifiedMfa(aal: unknown): boolean {
  return aal === "aal2";
}

export function safeAdminNextPath(value: string | null | undefined): string {
  if (!value || (value !== "/app/admin" && !value.startsWith("/app/admin/"))) {
    return "/app/admin";
  }
  if (value.startsWith("//") || value.includes("\\") || value.includes("\0")) {
    return "/app/admin";
  }
  return value;
}
