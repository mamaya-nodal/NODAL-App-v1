export const MIMICAL_PRODUCT_KEY = "mimical";
export const MIMICAL_VERSION = "1.1.0.8";

export type MimicalInstallationVersion = Readonly<{
  identityId: string | null;
  reportedVersion: string | null;
  reportedAt: string | null;
}>;

export function compareMimicalVersions(left: string | null | undefined, right: string) {
  const parse = (value: string | null | undefined) =>
    (value ?? "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function isConfirmedMimicalVersion(version: string | null | undefined) {
  return compareMimicalVersions(version, MIMICAL_VERSION) >= 0;
}
