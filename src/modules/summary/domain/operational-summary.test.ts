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
    expect(summary.realizedGainInCents).toBe(30_000);
    expect(summary.floatingInCents).toBe(20_000);
    expect(summary.virginPriceInCents).toBe(5_000);
    expect(summary.capitalNetInCents).toBe(118_000);
    expect(summary.fundingPendingInCents).toBe(2_000);
  });

  it("aplica los tramos actuales de comisión", () => {
    expect(calculateDeskCommission(999_900).amountInCents).toBe(440_000);
    expect(calculateDeskCommission(1_000_000).amountInCents).toBe(400_000);
    expect(calculateDeskCommission(3_500_000).amountInCents).toBe(875_000);
  });

  it("arrastra el cierre anterior sin convertirlo en depósito ni ganancia nueva", () => {
    const summary = buildOperationalSummary({
      accounts: [],
      controls: [],
      entries: [],
      fundingWithdrawals: [],
      opening: {
        accumulatedResultInCents: 250_000,
        brokerBalanceInCents: 600_000,
        capitalNetInCents: 400_000,
        fundingPendingInCents: 50_000,
        walletBalanceInCents: 0,
      },
      phaseWithdrawals: [],
      walletMovements: [],
    });

    expect(summary.brokerBalanceInCents).toBe(600_000);
    expect(summary.capitalNetInCents).toBe(400_000);
    expect(summary.periodResultInCents).toBe(0);
    expect(summary.accumulatedResultInCents).toBe(250_000);
    expect(summary.positionObservableInCents).toBe(650_000);
    expect(summary.positionExpectedInCents).toBe(650_000);
  });

  it("cobra un pendiente anterior sin computarlo como capital nuevo", () => {
    const summary = buildOperationalSummary({
      accounts: [],
      controls: [],
      entries: [],
      fundingWithdrawals: [],
      opening: {
        accumulatedResultInCents: 250_000,
        brokerBalanceInCents: 600_000,
        capitalNetInCents: 400_000,
        fundingPendingInCents: 50_000,
        walletBalanceInCents: 0,
      },
      phaseWithdrawals: [],
      walletMovements: [{
        amountInCents: 50_000,
        id: "previous-payout",
        kind: "prior_pending_collection",
        occurredOn: "2026-09-01",
        observation: null,
      }],
    });

    expect(summary.walletBalanceInCents).toBe(50_000);
    expect(summary.fundingPendingInCents).toBe(0);
    expect(summary.capitalNetInCents).toBe(400_000);
    expect(summary.positionDifferenceInCents).toBe(0);
  });

  it("reconcilia aporte, compra desde billetera y reutilización sin duplicar capital", () => {
    const summary = buildOperationalSummary({
      accounts: [{ id: "virgin", state: "virgin", stateOrigin: "automatic", priceInCents: 8_000, fundsOrigin: "Saldo generado" }],
      controls: [], entries: [], fundingWithdrawals: [], phaseWithdrawals: [],
      walletMovements: [{ id: "opening", walletId: "wallet", kind: "external_contribution", amountInCents: 10_000, occurredOn: "2026-09-01", observation: "Saldo inicial" }],
    });

    expect(summary.capitalNetInCents).toBe(10_000);
    expect(summary.walletBalanceInCents).toBe(2_000);
    expect(summary.periodResultInCents).toBe(-8_000);
    expect(summary.positionDifferenceInCents).toBe(0);
  });

  it("registra el fee real de billetera a broker como costo sin convertir el traspaso en capital", () => {
    const summary = buildOperationalSummary({
      accounts: [], entries: [], fundingWithdrawals: [], phaseWithdrawals: [],
      controls: [{ controlNumber: 1, kind: "balance_update", movementInCents: null, operatingResultInCents: null, originDestination: null, balanceAfterInCents: 99_700 }],
      walletMovements: [
        { id: "opening", walletId: "wallet", kind: "external_contribution", amountInCents: 100_000, occurredOn: "2026-09-01", observation: null },
        { id: "transfer", walletId: "wallet", kind: "wallet_to_broker", amountInCents: 100_000, feeInCents: 300, occurredOn: "2026-09-02", observation: null },
      ],
    });

    expect(summary.capitalNetInCents).toBe(100_000);
    expect(summary.walletBalanceInCents).toBe(0);
    expect(summary.periodResultInCents).toBe(-300);
    expect(summary.positionDifferenceInCents).toBe(0);
  });

  it("ingresa un payout neto del fee y mantiene la conciliación", () => {
    const summary = buildOperationalSummary({
      accounts: [], controls: [], entries: [], phaseWithdrawals: [], walletMovements: [],
      fundingWithdrawals: [{ id: "payout", accountId: "funded", amountInCents: 100_000, feeInCents: 300, approvedOn: "2026-09-02", collectedOn: "2026-09-03", walletId: "wallet" }],
    });

    expect(summary.walletBalanceInCents).toBe(99_700);
    expect(summary.periodResultInCents).toBe(99_700);
    expect(summary.positionDifferenceInCents).toBe(0);
  });
});
