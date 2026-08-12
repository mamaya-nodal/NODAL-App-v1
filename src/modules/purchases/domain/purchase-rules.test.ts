import { describe, expect, it } from "vitest";

import {
  INITIAL_ACCOUNT_STATE,
  nextConsecutive,
  parsePurchasePriceToCents,
  validatePurchaseDraft,
} from "./purchase-rules";

describe("reglas iniciales de compra", () => {
  it.each(["Aporte trader", "Saldo generado"])(
    "acepta el origen vigente %s",
    (fundsOrigin) => {
      expect(() =>
        validatePurchaseDraft({ companyId: "company-1", fundsOrigin, priceCents: 8_900 }),
      ).not.toThrow();
    },
  );

  it("rechaza Capital propio y cualquier origen inventado", () => {
    expect(() =>
      validatePurchaseDraft({
        companyId: "company-1",
        fundsOrigin: "Capital propio",
        priceCents: 8_900,
      }),
    ).toThrow("El origen de fondos no pertenece a la lista vigente.");
  });

  it("mantiene la cuenta nueva como virgen", () => {
    expect(INITIAL_ACCOUNT_STATE).toBe("Cuenta virgen");
  });

  it("calcula el siguiente consecutivo a partir del alcance correcto", () => {
    expect(nextConsecutive(0)).toBe(1);
    expect(nextConsecutive(149)).toBe(150);
  });

  it.each([
    ["89", 8_900],
    ["89.5", 8_950],
    ["89,50", 8_950],
    ["0", 0],
  ])("convierte el precio %s a centavos sin redondeos", (value, expected) => {
    expect(parsePurchasePriceToCents(value)).toBe(expected);
  });

  it.each(["", "-1", "1.234", "texto", "1,2.3"])(
    "rechaza el precio inválido %s",
    (value) => {
      expect(() => parsePurchasePriceToCents(value)).toThrow();
    },
  );
});
