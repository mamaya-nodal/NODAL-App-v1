import { describe, expect, it } from "vitest";

import { calculateDailyBalance } from "./balance-rules";

describe("saldo de referencia de Control Diario", () => {
  it("usa el primer depósito como saldo inicial sin generar resultado", () => {
    expect(
      calculateDailyBalance(null, { kind: "deposit", amountInCents: 500_000 }),
    ).toEqual({ balanceInCents: 500_000, operatingResultInCents: null });
  });

  it("calcula una ganancia contra el último saldo de referencia", () => {
    expect(
      calculateDailyBalance(500_000, {
        kind: "balance_update",
        balanceInCents: 550_000,
      }),
    ).toEqual({ balanceInCents: 550_000, operatingResultInCents: 50_000 });
  });

  it("calcula una pérdida conservando su signo económico", () => {
    expect(
      calculateDailyBalance(500_000, {
        kind: "balance_update",
        balanceInCents: 450_000,
      }),
    ).toEqual({ balanceInCents: 450_000, operatingResultInCents: -50_000 });
  });

  it("resta un retiro del saldo sin tratarlo como resultado operativo", () => {
    expect(
      calculateDailyBalance(550_000, {
        kind: "withdrawal",
        amountInCents: 100_000,
      }),
    ).toEqual({ balanceInCents: 450_000, operatingResultInCents: null });
  });

  it("continúa calculando desde el saldo ajustado por el retiro", () => {
    expect(
      calculateDailyBalance(450_000, {
        kind: "balance_update",
        balanceInCents: 470_000,
      }),
    ).toEqual({ balanceInCents: 470_000, operatingResultInCents: 20_000 });
  });

  it("suma depósitos posteriores sin producir una ganancia", () => {
    expect(
      calculateDailyBalance(500_000, {
        kind: "deposit",
        amountInCents: 100_000,
      }),
    ).toEqual({ balanceInCents: 600_000, operatingResultInCents: null });
  });

  it("exige un depósito para establecer el primer saldo", () => {
    expect(() =>
      calculateDailyBalance(null, {
        kind: "balance_update",
        balanceInCents: 500_000,
      }),
    ).toThrow("El primer saldo de referencia debe establecerse mediante un depósito.");
  });

  it("rechaza importes negativos o que no sean centavos enteros", () => {
    expect(() =>
      calculateDailyBalance(50_000, {
        kind: "deposit",
        amountInCents: -1,
      }),
    ).toThrow();
    expect(() =>
      calculateDailyBalance(50_000, {
        kind: "balance_update",
        balanceInCents: 50_000.5,
      }),
    ).toThrow();
  });
});
