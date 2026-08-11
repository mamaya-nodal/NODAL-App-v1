import { describe, expect, it } from "vitest";

import { toBrokerEntry, validateAllocationTotal } from "./result-allocation";

describe("distribucion del resultado de Control Diario", () => {
  it("acepta una distribucion que coincide exactamente con el total", () => {
    const result = validateAllocationTotal(50_000, [
      { accountId: "FFF_1", amountInCents: 10_000 },
      { accountId: "FFF_4", amountInCents: 10_000 },
      { accountId: "FFF_5", amountInCents: 10_000 },
      { accountId: "FFF_6", amountInCents: 10_000 },
      { accountId: "FFF_7", amountInCents: 10_000 },
    ]);

    expect(result).toEqual({ isValid: true, differenceInCents: 0 });
  });

  it("rechaza una correccion individual que excede el total", () => {
    const result = validateAllocationTotal(50_000, [
      { accountId: "FFF_1", amountInCents: 10_000 },
      { accountId: "FFF_4", amountInCents: 10_000 },
      { accountId: "FFF_5", amountInCents: 10_000 },
      { accountId: "FFF_6", amountInCents: 10_000 },
      { accountId: "FFF_7", amountInCents: 11_000 },
    ]);

    expect(result).toEqual({ isValid: false, differenceInCents: 1_000 });
  });

  it("acepta resultados negativos cuando la suma coincide", () => {
    const result = validateAllocationTotal(-50_000, [
      { accountId: "LUCID_1", amountInCents: -12_500 },
      { accountId: "LUCID_4", amountInCents: -12_500 },
      { accountId: "LUCID_7", amountInCents: -12_500 },
      { accountId: "LUCID_8", amountInCents: -12_500 },
    ]);

    expect(result).toEqual({ isValid: true, differenceInCents: 0 });
  });
});

describe("destino del resultado broker", () => {
  it("guarda una perdida como magnitud positiva en NETO BROKER negativo", () => {
    expect(toBrokerEntry(-12_500)).toEqual({
      destination: "NETO_BROKER_NEGATIVE",
      magnitudeInCents: 12_500,
    });
  });

  it("guarda una ganancia en NETO BROKER positivo", () => {
    expect(toBrokerEntry(12_500)).toEqual({
      destination: "NETO_BROKER_POSITIVE",
      magnitudeInCents: 12_500,
    });
  });
});
