export const MIMICAL_PRODUCT_KEY = "mimical";
// Una revisión que agrega telemetría de FileVersion debe tener su propia versión.
// Reutilizar 1.1.0.8 haría imposible distinguir un DLL anterior del corregido.
export const MIMICAL_VERSION = "1.1.0.9";

export type MimicalInstallationVersion = Readonly<{
  identityId: string | null;
  reportedAt: string | null;
  reportedVersion: string | null;
}>;

function versionParts(value: string) {
  return value.split(".").map((part) => Number.parseInt(part, 10));
}

export function compareMimicalVersions(left: string, right: string) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function isConfirmedMimicalVersion(version: string | null | undefined) {
  return Boolean(version && /^\d+(?:\.\d+){2,3}$/.test(version) && compareMimicalVersions(version, MIMICAL_VERSION) >= 0);
}
