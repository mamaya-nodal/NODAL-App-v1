import { describe, expect, it } from "vitest";
import { openingBrokerPresentation } from "./opening-broker-presentation";

const money = (value: number) => `USD ${value.toFixed(2)}`;

describe("opening broker presentation", () => {
  it("distinguishes a pending ownership decision from missing Ninja data", () => {
    expect(openingBrokerPresentation(null, 1, money)).toEqual({
      detail: "Confirmá debajo cuál de las cuentas detectadas te pertenece.",
      value: "Pendiente de confirmar",
    });
  });

  it("shows the confirmed aggregate when a broker account is already included", () => {
    expect(openingBrokerPresentation({
      balanceInCents: 500_000,
      observedAt: "2026-10-29T14:22:52.000Z",
      sourceAccounts: [{
        accountName: "2292943",
        balanceInCents: 500_000,
        connectionName: "En Vivo",
      }],
    }, 1, money)).toEqual({
      detail: "Se toma automáticamente del conector y no se edita aquí.",
      value: "USD 5000.00",
    });
  });

  it("reports an actual absence only when there is neither a balance nor a candidate", () => {
    expect(openingBrokerPresentation(null, 0, money)).toEqual({
      detail: "Ninja todavía no informó una cuenta broker para esta apertura.",
      value: "Sin cuenta broker detectada",
    });
  });
});
