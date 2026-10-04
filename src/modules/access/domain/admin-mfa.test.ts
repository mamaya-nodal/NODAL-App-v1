import { describe, expect, it } from "vitest";

import { hasVerifiedMfa, safeAdminNextPath } from "./admin-mfa";

describe("admin MFA", () => {
  it("acepta únicamente sesiones AAL2", () => {
    expect(hasVerifiedMfa("aal2")).toBe(true);
    expect(hasVerifiedMfa("aal1")).toBe(false);
    expect(hasVerifiedMfa(null)).toBe(false);
  });

  it("sólo permite volver a rutas administrativas internas", () => {
    expect(safeAdminNextPath("/app/admin/users")).toBe("/app/admin/users");
    expect(safeAdminNextPath("https://example.com")).toBe("/app/admin");
    expect(safeAdminNextPath("//example.com/app/admin")).toBe("/app/admin");
    expect(safeAdminNextPath("/app/admin-falso")).toBe("/app/admin");
    expect(safeAdminNextPath("/app")).toBe("/app/admin");
  });
});
