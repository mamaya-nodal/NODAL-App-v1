import { describe, expect, it } from "vitest";

import { buildProgressSummary, chooseHomeNextStep } from "./progress-summary";

describe("resumen inicial de progreso", () => {
  it("mantiene separados saldo, movimientos y resultado operativo", () => {
    const summary = buildProgressSummary({
      accountStates: ["virgin", "live", "closed"],
      controls: [
        { balanceInCents: 500_000, kind: "deposit", movementInCents: 500_000, operatedOn: "2026-08-10", operatingResultInCents: null },
        { balanceInCents: 560_000, kind: "balance_update", movementInCents: null, operatedOn: "2026-08-11", operatingResultInCents: 60_000 },
        { balanceInCents: 550_000, kind: "withdrawal", movementInCents: 10_000, operatedOn: "2026-08-12", operatingResultInCents: null },
      ],
      operationEntryCount: 3,
      purchaseCostsInCents: [8_900, 9_900],
    });

    expect(summary).toEqual({
      accountCount: 3,
      accountStates: { closed: 1, live: 1, virgin: 1 },
      brokerBalanceInCents: 550_000,
      brokerBalanceUpdatedOn: "2026-08-12",
      controlCount: 3,
      depositsInCents: 500_000,
      operatingResultInCents: 60_000,
      operationEntryCount: 3,
      purchaseCostInCents: 18_800,
      withdrawalsInCents: 10_000,
    });
  });

  it("expresa que todavía no existe un saldo sin inventar un cero", () => {
    const summary = buildProgressSummary({
      accountStates: [], controls: [], operationEntryCount: 0, purchaseCostsInCents: [],
    });

    expect(summary.brokerBalanceInCents).toBeNull();
    expect(summary.brokerBalanceUpdatedOn).toBeNull();
    expect(summary.operatingResultInCents).toBe(0);
  });

  it("guía primero a registrar una cuenta y luego a establecer el saldo", () => {
    const empty = buildProgressSummary({
      accountStates: [], controls: [], operationEntryCount: 0, purchaseCostsInCents: [],
    });
    const accountWithoutBalance = buildProgressSummary({
      accountStates: ["virgin"], controls: [], operationEntryCount: 0, purchaseCostsInCents: [8_900],
    });

    expect(chooseHomeNextStep(empty).href).toBe("#cuentas");
    expect(chooseHomeNextStep(accountWithoutBalance).label).toBe(
      "Informar depósito inicial",
    );
  });

  it("indica preparar la operación cuando ya existen cuenta y saldo", () => {
    const ready = buildProgressSummary({
      accountStates: ["virgin"],
      controls: [{
        balanceInCents: 500_000,
        kind: "deposit",
        movementInCents: 500_000,
        operatedOn: "2026-08-12",
        operatingResultInCents: null,
      }],
      operationEntryCount: 0,
      purchaseCostsInCents: [8_900],
    });

    expect(chooseHomeNextStep(ready).title).toBe("El espacio está listo para operar");
  });
});
