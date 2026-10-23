import { randomInt } from "node:crypto";

import { hashConnectorSecret } from "./connector-auth";

const pairingAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const pairingLifetimeMinutes = 5;

export type InstallerAuthorization = Readonly<{
  code: string;
  codeHash: string;
  expiresAt: string;
}>;

export function createInstallerAuthorization(now = new Date()): InstallerAuthorization {
  const code = Array.from(
    { length: 8 },
    () => pairingAlphabet[randomInt(pairingAlphabet.length)],
  ).join("");
  return {
    code,
    codeHash: hashConnectorSecret(code),
    expiresAt: new Date(now.getTime() + pairingLifetimeMinutes * 60 * 1000).toISOString(),
  };
}

export function isIdentityId(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
