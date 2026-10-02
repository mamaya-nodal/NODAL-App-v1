import { describe, expect, it } from "vitest";

import { deriveAccountAccountingState } from "./account-state";

describe("estado contable de una cuenta", () => {
  it("mantiene virgen una cuenta comprada sin datos operativos", () => {
    expect(
      deriveAccountAccountingState({
        hasOperationalData: false,
        phaseTotalGainInCents: [null, null, null, null, null, null],
      }),
    ).toBe("virgin");
  });

  it("convierte en viva una cuenta con actividad y sin total positivo", () => {
    expect(
      deriveAccountAccountingState({
        hasOperationalData: true,
        phaseTotalGainInCents: [-12_500, null, null, null, null, null],
      }),
    ).toBe("live");
  });

  it("mantiene viva una cuenta con actividad y total cero", () => {
    expect(
      deriveAccountAccountingState({
        hasOperationalData: true,
        phaseTotalGainInCents: [0, null, null, null, null, null],
      }),
    ).toBe("live");
  });

  it("cierra una cuenta cuando alguna fase tiene TOTAL GANANCIA positivo", () => {
    expect(
      deriveAccountAccountingState({
        hasOperationalData: true,
        phaseTotalGainInCents: [-10_000, 5_000, null, null, null, null],
      }),
    ).toBe("closed");
  });

  it("respeta los estados forzados hasta volver a Automatico", () => {
    const evidence = {
      hasOperationalData: true,
      phaseTotalGainInCents: [5_000],
    };

    expect(deriveAccountAccountingState({ ...evidence, stateOrigin: "manual_live" })).toBe(
      "live",
    );
    expect(deriveAccountAccountingState({ ...evidence, stateOrigin: "manual_closed" })).toBe(
      "closed",
    );
    expect(deriveAccountAccountingState({ ...evidence, stateOrigin: "automatic" })).toBe(
      "closed",
    );
  });

  it("rechaza totales que no esten expresados en centavos enteros", () => {
    expect(() =>
      deriveAccountAccountingState({
        hasOperationalData: true,
        phaseTotalGainInCents: [10.5],
      }),
    ).toThrow("Cada TOTAL GANANCIA debe expresarse en centavos enteros.");
  });
});
