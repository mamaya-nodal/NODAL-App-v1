import { describe, expect, it } from "vitest";

import { calculatePhaseTotals } from "./phase-totals";

describe("totales contables de una fase", () => {
  it("calcula Evaluacion como broker positivo menos broker negativo", () => {
    expect(
      calculatePhaseTotals({
        brokerNegativeInCents: 20_000,
        brokerPositiveInCents: 50_000,
        withdrawalInCents: 0,
      }),
    ).toEqual({ carryToNextPhaseInCents: 0, totalGainInCents: 30_000 });
  });

  it("arrastra la magnitud de un total negativo a la fase siguiente", () => {
    expect(
      calculatePhaseTotals({
        brokerNegativeInCents: 50_000,
        brokerPositiveInCents: 20_000,
        withdrawalInCents: 0,
      }),
    ).toEqual({ carryToNextPhaseInCents: 30_000, totalGainInCents: -30_000 });
  });

  it("incorpora TOTAL RETIRO en las vueltas posteriores", () => {
    expect(
      calculatePhaseTotals({
        brokerNegativeInCents: 40_000,
        brokerPositiveInCents: 10_000,
        withdrawalInCents: 45_000,
      }),
    ).toEqual({ carryToNextPhaseInCents: 0, totalGainInCents: 15_000 });
  });

  it("rechaza magnitudes negativas en las columnas de entrada", () => {
    expect(() =>
      calculatePhaseTotals({
        brokerNegativeInCents: -1,
        brokerPositiveInCents: 0,
        withdrawalInCents: 0,
      }),
    ).toThrow("NETO BROKER - debe ser un importe no negativo en centavos.");
  });
});
