import { describe, expect, it } from "vitest";

import { identityAccentClass, identityAccentIndex } from "./identity-accent";

describe("color visual de identidades", () => {
  it("mantiene un color estable para la misma identidad", () => {
    expect(identityAccentIndex("identity-alanis")).toBe(identityAccentIndex("identity-alanis"));
    expect(identityAccentClass("identity-alanis")).toMatch(/^identity-accent identity-accent-[0-7]$/);
  });

  it("siempre devuelve un indice dentro de la paleta", () => {
    for (const identityId of ["a", "b", "identity-david", "00000000-0000-0000-0000-000000000000"]) {
      expect(identityAccentIndex(identityId)).toBeGreaterThanOrEqual(0);
      expect(identityAccentIndex(identityId)).toBeLessThan(8);
    }
  });
});

