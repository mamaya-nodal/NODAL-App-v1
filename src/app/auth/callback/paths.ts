export function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/app";
  }
  return value;
}

export function authErrorPath(reason: "provider" | "session") {
  return `/auth/error?reason=${reason}`;
}
