import { describe, expect, it } from "vitest";
import { buildOperationalSummary, type OperationalOpeningSnapshot, type SummaryAccount } from "./operational-summary";
import { openingFromClosure } from "./closure-opening";
import { buildConciliationBreakdown, sumConciliationLines } from "./conciliation-breakdown";
import { applyPriorPeriodAdjustments } from "@/modules/accounting/domain/prior-period-adjustments";
import type { OperationRegisterEntry } from "@/modules/operations/domain/operation-register";

const opening: OperationalOpeningSnapshot = {
  accumulatedResultInCents: 0, brokerBalanceInCents: 100_000, capitalNetInCents: 100_000,
  walletBalanceInCents: 0, fundingPendingInCents: 0, liveResultInCents: 0,
  virginPriceInCents: 0, verified: true, accumulatedBreakdownAvailable: true,
};
const account = (state: SummaryAccount["state"], carried = false): SummaryAccount => ({
  id: "a", priceInCents: 10_000, purchaseBelongsToPeriod: !carried, state,
  stateOrigin: state === "live" ? "manual_live" : state === "closed" ? "manual_closed" : "automatic",
  fundsOrigin: "Aporte trader",
});
const entry = (value: number, phase: OperationRegisterEntry["phase"] = "Evaluacion"): OperationRegisterEntry => ({
  id: `entry-${value}`, accountId: "a", accountReference: 1, companyId: "c", companyName: "C",
  dailyControlId: "d", destination: value < 0 ? "NETO BROKER -" : "NETO BROKER +",
  magnitudeInCents: Math.abs(value), operatedOn: "2026-10-03", participantRole: "leader", phase,
});

describe("signed result continuity, without balancing adjustments", () => {
  it.each([
    { label: "nueva viva negativa", state: "live", initial: 0, broker: -20_000, priorBroker: 0, expected: -30_000 },
    { label: "viva trasladada sin actividad", state: "live", initial: -30_000, broker: 0, priorBroker: -20_000, expected: 0 },
    { label: "viva trasladada con nueva pérdida", state: "live", initial: -30_000, broker: -5_000, priorBroker: -20_000, expected: -5_000 },
    { label: "trasladada que cierra positiva", state: "closed", initial: -30_000, broker: 50_000, priorBroker: -20_000, expected: 50_000 },
    { label: "trasladada cerrada con pérdida", state: "closed", initial: -30_000, broker: -5_000, priorBroker: -20_000, expected: -5_000 },
    { label: "viva forzada con resultado positivo", state: "live", initial: 0, broker: 20_000, priorBroker: 0, expected: 10_000 },
    { label: "positiva trasladada", state: "live", initial: 10_000, broker: 5_000, priorBroker: 20_000, expected: 5_000 },
  ] as const)("$label", ({ state, initial, broker, priorBroker, expected }) => {
    const carried = initial !== 0;
    const summary = buildOperationalSummary({
      accounts: [account(state, carried)],
      entries: [entry(priorBroker + broker)], phaseWithdrawals: [], fundingWithdrawals: [], walletMovements: [],
      controls: [{ controlNumber: 1, kind: "balance_update", movementInCents: null, originDestination: null,
        operatingResultInCents: broker, balanceAfterInCents: 100_000 + priorBroker + broker }],
      opening: { ...opening, accumulatedResultInCents: initial, liveResultInCents: initial,
        brokerBalanceInCents: 100_000 + priorBroker, capitalNetInCents: carried ? 110_000 : 100_000 },
    });
    expect(summary.periodResultInCents).toBe(expected);
    expect(summary.accumulatedResultInCents).toBe(initial + expected);
    expect(summary.realizedReconciliationDifferenceInCents).toBe(0);
    const breakdown = buildConciliationBreakdown(summary);
    expect(breakdown.gains.reconstructedTotal).toBe(expected);
    expect(breakdown.gains.ledgerTotal).toBe(expected);
    expect(breakdown.accumulated.total).toBe(summary.accumulatedResultInCents);
    expect(breakdown.gains.verified).toBe(true);
  });

  it.each([false, true])("cuenta virgen, trasladada=%s", (carried) => {
    const summary = buildOperationalSummary({ accounts: [account("virgin", carried)], controls: [], entries: [],
      fundingWithdrawals: [], phaseWithdrawals: [], walletMovements: [],
      opening: { ...opening, virginPriceInCents: carried ? 10_000 : 0, accumulatedResultInCents: carried ? -10_000 : 0 },
    });
    expect(summary.periodResultInCents).toBe(carried ? 0 : -10_000);
    expect(summary.realizedReconciliationDifferenceInCents).toBe(0);
    expect(buildConciliationBreakdown(summary).accumulated.total).toBe(-10_000);
  });

  it("una virgen trasladada comienza a operar sin volver a descontar la compra", () => {
    const summary = buildOperationalSummary({ accounts: [account("live", true)], entries: [entry(-5_000)],
      controls: [{ controlNumber: 1, kind: "balance_update", balanceAfterInCents: 95_000,
        operatingResultInCents: -5_000, movementInCents: null, originDestination: null }],
      fundingWithdrawals: [], phaseWithdrawals: [], walletMovements: [],
      opening: { ...opening, virginPriceInCents: 10_000, accumulatedResultInCents: -10_000 },
    });
    expect(summary.periodResultInCents).toBe(-5_000);
    expect(summary.resultDetails?.liveResultInCents).toBe(-15_000);
    expect(summary.realizedReconciliationDifferenceInCents).toBe(0);
  });

  it("payout aprobado y cobrado: cuenta, pendiente, billetera y fee se computan una vez", () => {
    const summary = buildOperationalSummary({ accounts: [account("closed")], entries: [entry(-20_000)],
      controls: [{ controlNumber: 1, kind: "balance_update", balanceAfterInCents: 80_000,
        operatingResultInCents: -20_000, movementInCents: null, originDestination: null }],
      phaseWithdrawals: [{ accountId: "a", phase: "Primera vuelta", totalWithdrawalInCents: 100_000 }],
      fundingWithdrawals: [{ id: "p", accountId: "a", phase: "Primera vuelta", amountInCents: 100_000,
        approvedOn: "2026-10-03", collectedOn: "2026-10-03", feeInCents: 300 }],
      walletMovements: [], opening,
    });
    expect(summary.realizedGainInCents).toBe(70_000);
    expect(summary.periodResultInCents).toBe(69_700);
    expect(summary.walletBalanceInCents).toBe(99_700);
    expect(summary.fundingPendingInCents).toBe(0);
    expect(summary.positionDifferenceInCents).toBe(0);
    expect(summary.realizedReconciliationDifferenceInCents).toBe(0);
    expect(buildConciliationBreakdown(summary).accumulated.total).toBe(69_700);
  });

  it("broker sin cobertura y gastos independientes no se atribuyen a cuentas", () => {
    const summary = buildOperationalSummary({ accounts: [], entries: [], phaseWithdrawals: [], fundingWithdrawals: [], opening,
      controls: [{ controlNumber: 1, kind: "balance_update", balanceAfterInCents: 101_160,
        operatingResultInCents: 1_160, movementInCents: null, originDestination: null, isUncovered: true }],
      walletMovements: [{ id: "w", kind: "wallet_to_wallet", amountInCents: 10_000, feeInCents: 300,
        occurredOn: "2026-10-03", observation: null }],
    });
    expect(summary.periodResultInCents).toBe(860);
    expect(summary.realizedGainInCents).toBe(0);
    expect(summary.realizedReconciliationDifferenceInCents).toBe(0);
  });

  it("una imputación faltante permanece como diferencia, no crea una contrapartida ficticia", () => {
    const summary = buildOperationalSummary({ accounts: [account("live")], entries: [entry(-20_000)],
      controls: [{ controlNumber: 1, kind: "balance_update", balanceAfterInCents: 80_100,
        operatingResultInCents: -19_900, movementInCents: null, originDestination: null }],
      phaseWithdrawals: [], fundingWithdrawals: [], walletMovements: [], opening,
    });
    const breakdown = buildConciliationBreakdown(summary);
    expect(summary.realizedReconciliationDifferenceInCents).toBe(-100);
    expect(breakdown.gains.differenceInCents).toBe(-100);
    expect(sumConciliationLines(breakdown.gains.reconstructed)).toBe(-30_000);
    expect(breakdown.gains.ledgerTotal).toBe(-29_900);
  });

  it("conserva rectificaciones aprobadas explícitas a través del siguiente cierre", () => {
    const base = buildOperationalSummary({ accounts: [], entries: [], controls: [], phaseWithdrawals: [],
      fundingWithdrawals: [], walletMovements: [], opening });
    const revised = applyPriorPeriodAdjustments(base, { resultInCents: -500, commissionInCents: 0 });
    expect(buildConciliationBreakdown(revised).accumulated.total).toBe(-500);
    expect(revised.periodResultInCents).toBe(0);
    const nextOpening = openingFromClosure(revised, [], 0, opening);
    expect(nextOpening.accumulatedAdjustmentsInCents).toBe(-500);
    expect(nextOpening.verified).toBe(false); // Capital now has an unexplained difference; do not conceal it.
  });

  it("el arrastre requiere evidencia congelada completa; no inventa lo que falta", () => {
    const base = buildOperationalSummary({ accounts: [account("live")], entries: [entry(-20_000)],
      controls: [{ controlNumber: 1, kind: "balance_update", balanceAfterInCents: 80_000,
        operatingResultInCents: -20_000, movementInCents: null, originDestination: null }],
      phaseWithdrawals: [], fundingWithdrawals: [], walletMovements: [], opening });
    const carried = [{ accountState: "live" as const, lifetimeResultInCents: -30_000, purchasePriceInCents: 10_000 }];
    expect(openingFromClosure(base, carried, 0, opening).verified).toBe(true);
    expect(openingFromClosure(base, [], 0, opening).verified).toBe(false);
    expect(openingFromClosure(base, [{ ...carried[0], lifetimeResultInCents: -29_999 }], 0, opening).verified).toBe(false);
    expect(openingFromClosure(base, [], 0, opening).accumulatedResultInCents).toBe(-30_000);
    expect(openingFromClosure({ ...base, accumulatedResultInCents: -29_999 }, carried, 0, opening).verified).toBe(false);
  });
});
