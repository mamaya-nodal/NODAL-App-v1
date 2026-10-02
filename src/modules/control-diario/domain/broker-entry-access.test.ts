import { describe, expect, it } from "vitest";

import { validateBrokerEntryAccess } from "./broker-entry-access";

describe("acceso a movimientos de broker desde Operaciones", () => {
  it.each(["deposit", "withdrawal"] as const)(
    "bloquea %s hasta que exista el flujo de Contabilidad",
    (kind) => {
      expect(validateBrokerEntryAccess(kind, null)).toMatch(/Contabilidad/);
    },
  );

  it("bloquea un saldo manual aunque se presente como actualización", () => {
    expect(validateBrokerEntryAccess("balance_update", null)).toMatch(
      /saldos manuales/,
    );
  });

  it("permite únicamente un saldo asociado a un evento real de NinjaTrader", () => {
    expect(
      validateBrokerEntryAccess(
        "balance_update",
        "7a6ff1cb-00d4-4a02-8da1-df4ef9213988",
      ),
    ).toBeNull();
  });
});
