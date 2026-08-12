import { describe, expect, it } from "vitest";

import {
  assertCanReceiveBrokerBalance,
  correctBrokerBalanceReview,
  createBrokerBalanceReview,
  effectiveBrokerBalance,
} from "./broker-sync-review";

describe("revision de saldo recibido desde broker", () => {
  it("calcula el resultado contra el ultimo saldo confirmado", () => {
    expect(createBrokerBalanceReview(500_000, 560_000)).toEqual({
      correctedBalanceInCents: null,
      correctionReason: null,
      operatingResultInCents: 60_000,
      receivedBalanceInCents: 560_000,
    });
  });

  it("bloquea otra recepcion mientras exista una sin resolver", () => {
    const pending = createBrokerBalanceReview(500_000, 560_000);

    expect(() => assertCanReceiveBrokerBalance(pending)).toThrow(
      "Primero resolvé el saldo recibido de NinjaTrader.",
    );
  });

  it("conserva el dato original al aplicar una contingencia", () => {
    const received = createBrokerBalanceReview(500_000, 560_000);
    const corrected = correctBrokerBalanceReview(
      received,
      500_000,
      570_000,
      "Saldo recibido incorrecto",
    );

    expect(corrected).toEqual({
      correctedBalanceInCents: 570_000,
      correctionReason: "Saldo recibido incorrecto",
      operatingResultInCents: 70_000,
      receivedBalanceInCents: 560_000,
    });
    expect(effectiveBrokerBalance(corrected)).toBe(570_000);
  });

  it("exige un motivo para la correccion", () => {
    const received = createBrokerBalanceReview(500_000, 560_000);

    expect(() =>
      correctBrokerBalanceReview(received, 500_000, 570_000, " "),
    ).toThrow("La contingencia debe indicar un motivo.");
  });
});
