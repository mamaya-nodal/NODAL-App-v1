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

  it("traslada saldo entre billeteras sin alterar capital y registra sólo el fee como costo", () => {
    const summary = buildOperationalSummary({
      accounts: [], controls: [], entries: [], fundingWithdrawals: [], phaseWithdrawals: [],
      opening: {
        accumulatedResultInCents: 0,
        brokerBalanceInCents: 0,
        capitalNetInCents: 20_000,
        fundingPendingInCents: 0,
        walletBalanceInCents: 20_000,
      },
      walletMovements: [{
        amountInCents: 20_000,
        destinationWalletId: "destination",
        feeInCents: 300,
        id: "internal-transfer",
        kind: "wallet_to_wallet",
        occurredOn: "2026-09-24",
        observation: null,
        walletId: "source",
      }],
    });

    expect(summary.capitalNetInCents).toBe(20_000);
    expect(summary.walletBalanceInCents).toBe(19_700);
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

  it("conserva una cuenta viva trasladada sin volver a descontar su compra", () => {
    const summary = buildOperationalSummary({
      accounts: [{
        fundsOrigin: "Aporte trader",
        id: "carried-live",
        priceInCents: 8_000,
        purchaseBelongsToPeriod: false,
        state: "live",
        stateOrigin: "automatic",
      }],
      controls: [],
      entries: [{
        accountId: "carried-live",
        accountReference: 1,
        companyId: "company",
        companyName: "Company",
        dailyControlId: "previous-period-control",
        destination: "NETO BROKER -",
        id: "previous-period-entry",
        magnitudeInCents: 12_000,
        operatedOn: "2026-09-30",
        participantRole: "leader",
        phase: "Evaluacion",
      }],
      fundingWithdrawals: [],
      opening: {
        accumulatedResultInCents: -20_000,
        brokerBalanceInCents: 80_000,
        capitalNetInCents: 100_000,
        fundingPendingInCents: 0,
        gainReconciliationBaselineInCents: 20_000,
        walletBalanceInCents: 0,
      },
      phaseWithdrawals: [],
      walletMovements: [],
    });

    expect(summary.floatingInCents).toBe(20_000);
    expect(summary.periodResultInCents).toBe(0);
    expect(summary.capitalNetInCents).toBe(100_000);
    expect(summary.realizedReconciliationDifferenceInCents).toBe(0);
  });

  it("reconoce en el nuevo período la vida completa de una cuenta trasladada que se cierra", () => {
    const summary = buildOperationalSummary({
      accounts: [{
        fundsOrigin: "Aporte trader", id: "carried-closed", priceInCents: 0,
        purchaseBelongsToPeriod: false, state: "closed", stateOrigin: "automatic",
      }],
      controls: [{
        balanceAfterInCents: 130_000, controlNumber: 1, kind: "balance_update",
        movementInCents: null, operatingResultInCents: 30_000, originDestination: null,
      }],
      entries: [
        { accountId: "carried-closed", accountReference: 1, companyId: "company", companyName: "Company", dailyControlId: "old", destination: "NETO BROKER +", id: "old-entry", magnitudeInCents: 20_000, operatedOn: "2026-09-30", participantRole: "leader", phase: "Evaluacion" },
        { accountId: "carried-closed", accountReference: 1, companyId: "company", companyName: "Company", dailyControlId: "new", destination: "NETO BROKER +", id: "new-entry", magnitudeInCents: 30_000, operatedOn: "2026-10-06", participantRole: "leader", phase: "Evaluacion" },
      ],
      fundingWithdrawals: [],
      opening: {
        accumulatedResultInCents: 20_000, brokerBalanceInCents: 100_000,
        capitalNetInCents: 80_000, fundingPendingInCents: 0,
        gainReconciliationBaselineInCents: -20_000, walletBalanceInCents: 0,
      },
      phaseWithdrawals: [], walletMovements: [],
    });

    expect(summary.realizedGainInCents).toBe(50_000);
    expect(summary.periodResultInCents).toBe(30_000);
    expect(summary.realizedReconciliationDifferenceInCents).toBe(0);
  });
});
