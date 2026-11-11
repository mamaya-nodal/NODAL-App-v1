import { describe, expect, it } from "vitest";

import { identityAccentClass, identityAccentHue, identityAccentStyle } from "./identity-accent";

describe("color visual de identidades", () => {
  it("mantiene un color estable para la misma identidad", () => {
    expect(identityAccentHue("identity-alanis")).toBe(identityAccentHue("identity-alanis"));
    expect(identityAccentClass("identity-alanis")).toMatch(/^identity-accent identity-hue-\d+$/);
    expect(identityAccentStyle("identity-alanis")).toEqual(identityAccentStyle("identity-alanis"));
  });

  it("distribuye los colores en todo el circulo cromatico", () => {
    for (const identityId of ["a", "b", "identity-david", "00000000-0000-0000-0000-000000000000"]) {
      expect(identityAccentHue(identityId)).toBeGreaterThanOrEqual(0);
      expect(identityAccentHue(identityId)).toBeLessThan(360);
    }
    expect(identityAccentHue("identity-alanis")).not.toBe(identityAccentHue("identity-leandro"));
  });
});

