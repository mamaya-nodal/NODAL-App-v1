import { describe, expect, it } from "vitest";
import { buildOperationalSummary, calculateDeskCommission } from "./operational-summary";

describe("operational summary", () => {
  it("separa capital, billetera, ganancia realizada y conciliaciones", () => {
    const summary = buildOperationalSummary({
      accounts: [
        { id: "closed", state: "closed", stateOrigin: "automatic", priceInCents: 10_000, fundsOrigin: "Aporte trader" },
        { id: "live", state: "live", stateOrigin: "automatic", priceInCents: 8_000, fundsOrigin: "Saldo generado" },
        { id: "virgin", state: "virgin", stateOrigin: "automatic", priceInCents: 5_000, fundsOrigin: "Aporte trader" },
      ],
      controls: [{ controlNumber: 1, kind: "deposit", movementInCents: 100_000, operatingResultInCents: null, originDestination: "Aporte trader", balanceAfterInCents: 100_000 }],
      entries: [
        { id: "a", accountId: "closed", accountReference: 1, companyId: "x", companyName: "X", dailyControlId: "d", destination: "NETO BROKER +", magnitudeInCents: 40_000, operatedOn: "2026-08-01", participantRole: "leader", phase: "Evaluacion" },
        { id: "b", accountId: "live", accountReference: 2, companyId: "x", companyName: "X", dailyControlId: "e", destination: "NETO BROKER -", magnitudeInCents: 12_000, operatedOn: "2026-08-01", participantRole: "leader", phase: "Evaluacion" },
      ],
      phaseWithdrawals: [],
      walletMovements: [{ id: "w", kind: "external_contribution", amountInCents: 3_000, occurredOn: "2026-08-01", observation: null }],
      fundingWithdrawals: [{ id: "r", accountId: "closed", amountInCents: 2_000, approvedOn: "2026-08-02", collectedOn: null }],
    });
    expect(summary.realizedGainInCents).toBe(40_000);
    expect(summary.floatingInCents).toBe(12_000);
    expect(summary.virginPriceInCents).toBe(5_000);
    expect(summary.capitalNetInCents).toBe(118_000);
    expect(summary.fundingPendingInCents).toBe(2_000);
  });

  it("aplica los tramos actuales de comisión", () => {
    expect(calculateDeskCommission(999_900).amountInCents).toBe(440_000);
    expect(calculateDeskCommission(1_000_000).amountInCents).toBe(400_000);
    expect(calculateDeskCommission(3_500_000).amountInCents).toBe(875_000);
  });
});
