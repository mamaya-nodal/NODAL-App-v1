import { describe, expect, it } from "vitest";

import { authErrorPath, safeNextPath } from "./route";

describe("safeNextPath", () => {
  it("acepta únicamente rutas internas", () => {
    expect(safeNextPath("/app/compras")).toBe("/app/compras");
  });

  it.each([null, "", "https://example.com", "//example.com"])(
    "evita redirecciones externas para %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/app");
    },
  );
});

describe("authErrorPath", () => {
  it("uses a limited set of safe error reasons", () => {
    expect(authErrorPath("provider")).toBe("/auth/error?reason=provider");
    expect(authErrorPath("session")).toBe("/auth/error?reason=session");
  });
});
