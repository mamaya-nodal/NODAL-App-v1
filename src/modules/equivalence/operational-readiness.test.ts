import { describe, expect, it } from "vitest";

import { allocateResultEqually, toBrokerEntry } from "@/modules/control-diario/domain/result-allocation";
import type { OperationRegisterEntry } from "@/modules/operations/domain/operation-register";
import { buildOperationalSummary } from "@/modules/summary/domain/operational-summary";
import { buildSummaryAlerts } from "@/modules/summary/domain/summary-alerts";

function entry(accountId: string, amountInCents: number): OperationRegisterEntry {
  const broker = toBrokerEntry(amountInCents);
  if (broker.destination === "NONE") throw new Error("The scenario requires a broker result.");
  return {
    accountId,
    accountReference: Number(accountId.slice(-1)),
    companyId: "lucid",
    companyName: "LUCID",
    dailyControlId: `control-${accountId}`,
    destination: broker.destination === "NETO_BROKER_POSITIVE" ? "NETO BROKER +" : "NETO BROKER -",
    id: `entry-${accountId}`,
    magnitudeInCents: broker.magnitudeInCents,
    operatedOn: "2026-08-15",
    participantRole: accountId === "account-1" ? "leader" : "replica",
    phase: "Evaluacion",
  };
}

describe("recorrido operativo completo listo para piloto", () => {
  it("reconstruye una jornada con réplicas, cuenta viva, retiro cobrado y conciliaciones en cero", () => {
    const allocations = allocateResultEqually(20_000, "account-1", ["account-2"]);
    expect(allocations).toEqual([
      { accountId: "account-1", amountInCents: 10_000, role: "leader" },
      { accountId: "account-2", amountInCents: 10_000, role: "replica" },
    ]);

    const summary = buildOperationalSummary({
      accounts: [
        { fundsOrigin: "Aporte trader", id: "account-1", priceInCents: 8_900, state: "closed", stateOrigin: "automatic" },
        { fundsOrigin: "Aporte trader", id: "account-2", priceInCents: 8_900, state: "closed", stateOrigin: "automatic" },
        { fundsOrigin: "Saldo generado", id: "account-3", priceInCents: 8_900, state: "live", stateOrigin: "automatic" },
      ],
      controls: [
        { balanceAfterInCents: 500_000, controlNumber: 1, kind: "deposit", movementInCents: 500_000, operatingResultInCents: null, originDestination: "Aporte trader" },
        { balanceAfterInCents: 493_300, controlNumber: 2, kind: "balance_update", movementInCents: null, operatingResultInCents: -6_700, originDestination: null },
      ],
      entries: [entry("account-1", 10_000), entry("account-2", 10_000), entry("account-3", -7_800)],
      fundingWithdrawals: [{ accountId: "account-1", amountInCents: 18_900, approvedOn: "2026-08-15", collectedOn: "2026-08-15", id: "funding-1" }],
      phaseWithdrawals: [],
      walletMovements: [],
    });

    expect(summary.accountStates).toEqual({ closed: 2, live: 1, virgin: 0 });
    expect(summary.brokerBalanceInCents).toBe(493_300);
    expect(summary.realizedGainInCents).toBe(2_200);
    expect(summary.floatingInCents).toBe(16_700);
    expect(summary.fundingCollectedInCents).toBe(18_900);
    expect(summary.walletBalanceInCents).toBe(10_000);
    expect(summary.commissionInCents).toBe(1_100);
    expect(summary.traderGainInCents).toBe(1_100);
    expect(summary.positionDifferenceInCents).toBe(0);
    expect(summary.realizedReconciliationDifferenceInCents).toBe(0);
    expect(buildSummaryAlerts(summary)).toEqual([]);
  });
});
