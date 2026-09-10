import { describe, expect, it } from "vitest";

import {
  isolatedNinjaConnectionNames,
  isNinjaConnectionActive,
  observedNinjaConnectionNames,
} from "./connection-access";

describe("Ninja connection access", () => {
  it("incorpora conexiones nuevas sin una aprobación individual", () => {
    expect(isNinjaConnectionActive("Tradeify - Ivo", new Set())).toBe(true);
  });

  it("sólo excluye una conexión aislada expresamente por un administrador", () => {
    const isolated = isolatedNinjaConnectionNames([
      { connection_name: "IVO-L1", status: "approved" },
      { connection_name: "Conexión ajena", status: "isolated" },
    ]);

    expect(isNinjaConnectionActive("IVO-L1", isolated)).toBe(true);
    expect(isNinjaConnectionActive("Tradeify - Ivo", isolated)).toBe(true);
    expect(isNinjaConnectionActive("Conexión ajena", isolated)).toBe(false);
  });

  it("prepara cada conexión observada una sola vez", () => {
    expect(observedNinjaConnectionNames([
      { connectionName: "Tradeify - Ivo" },
      { connectionName: "IVO-L1" },
      { connectionName: "Tradeify - Ivo" },
    ])).toEqual(["IVO-L1", "Tradeify - Ivo"]);
  });
});
