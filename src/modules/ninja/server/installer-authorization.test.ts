import { describe, expect, it } from "vitest";

import { createInstallerAuthorization, isIdentityId } from "./installer-authorization";

describe("automatic Ninja installer authorization", () => {
  it("creates an opaque five-minute one-use credential", () => {
    const now = new Date("2026-10-23T15:00:00.000Z");
    const authorization = createInstallerAuthorization(now);
    expect(authorization.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(authorization.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(authorization.codeHash).not.toContain(authorization.code);
    expect(authorization.expiresAt).toBe("2026-10-23T15:05:00.000Z");
  });

  it("accepts only UUID identity destinations", () => {
    expect(isIdentityId("22222222-2222-4222-8222-222222222222")).toBe(true);
    expect(isIdentityId("personal")).toBe(false);
    expect(isIdentityId(null)).toBe(false);
  });
});
