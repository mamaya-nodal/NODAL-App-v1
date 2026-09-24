import { describe, expect, it } from "vitest";

import { prepareDirectIdentity } from "./direct-identity";

describe("direct identity", () => {
  it("normaliza nombre completo y correo", () => {
    expect(prepareDirectIdentity({
      email: "  Lupe@Example.COM ",
      fullName: "  María   Guadalupe Pérez  ",
    })).toEqual({
      email: "lupe@example.com",
      firstName: "María",
      lastName: "Guadalupe Pérez",
    });
  });

  it("exige nombre y apellido además de un correo válido", () => {
    expect(prepareDirectIdentity({ email: "lupe@example.com", fullName: "Lupe" })).toBeNull();
    expect(prepareDirectIdentity({ email: "correo-invalido", fullName: "Lupe Pérez" })).toBeNull();
  });
});
