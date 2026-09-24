import { describe, expect, it } from "vitest";

import { buildCapitalHistory, buildHomePerformance } from "./home-dashboard";

describe("home dashboard", () => {
  it("agrupa resultados por jornada antes de calcular mejor, peor y promedio", () => {
    expect(buildHomePerformance([
      { operatedOn: "2026-08-01", resultInCents: 10_000 },
      { operatedOn: "2026-08-01", resultInCents: 5_000 },
      { operatedOn: "2026-08-02", resultInCents: -3_000 },
      { operatedOn: "2026-08-03", resultInCents: null },
    ])).toEqual({ averageInCents: 6_000, bestInCents: 15_000, worstInCents: -3_000 });
  });

  it("devuelve métricas vacías cuando todavía no hay jornadas operadas", () => {
    expect(buildHomePerformance([])).toEqual({
      averageInCents: null,
      bestInCents: null,
      worstInCents: null,
    });
  });

  it("acumula el capital neto aportado mes a mes sin contar saldo generado", () => {
    expect(buildCapitalHistory({
      periods: [
        { id: "feb", periodMonth: "2026-02-01" },
        { id: "ene", periodMonth: "2026-01-01" },
      ],
      purchases: [
        { fundsOrigin: "Aporte trader", periodId: "ene", priceInCents: 10_000 },
        { fundsOrigin: "Saldo generado", periodId: "feb", priceInCents: 8_000 },
      ],
      controls: [
        { kind: "deposit", movementInCents: 50_000, originDestination: "Aporte trader", periodId: "ene" },
        { kind: "withdrawal", movementInCents: 5_000, originDestination: "Retiro personal", periodId: "feb" },
      ],
      walletMovements: [
        { amountInCents: 20_000, kind: "external_contribution", periodId: "ene" },
        { amountInCents: 4_000, kind: "personal_withdrawal", periodId: "feb" },
        { amountInCents: 15_000, kind: "wallet_to_wallet", periodId: "feb" },
      ],
    })).toEqual([
      { capitalInCents: 80_000, periodMonth: "2026-01-01" },
      { capitalInCents: 71_000, periodMonth: "2026-02-01" },
    ]);
  });
});
