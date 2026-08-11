import { describe, expect, it } from "vitest";

import { safeNextPath } from "./route";

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
