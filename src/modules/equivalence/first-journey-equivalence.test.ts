import { describe, expect, it } from "vitest";

import { calculateDailyBalance } from "@/modules/control-diario/domain/balance-rules";
import {
  allocateResultEqually,
  toBrokerEntry,
} from "@/modules/control-diario/domain/result-allocation";
import {
  summarizeBrokerEntries,
  type OperationRegisterEntry,
} from "@/modules/operations/domain/operation-register";
import {
  nextConsecutive,
  validatePurchaseDraft,
} from "@/modules/purchases/domain/purchase-rules";
import { buildProgressSummary } from "@/modules/summary/domain/progress-summary";

describe("primer recorrido integral de equivalencia", () => {
  it("conserva compras, saldo, réplicas no consecutivas, Registro y Resumen", () => {
    const accountIds = Array.from({ length: 8 }, (_, index) =>
      `lucid-${nextConsecutive(index)}`,
    );

    for (const companyAccountId of accountIds) {
      expect(() =>
        validatePurchaseDraft({
          companyId: "lucid",
          fundsOrigin: "Aporte trader",
          priceCents: 8_900,
        }),
      ).not.toThrow();
      expect(companyAccountId).toMatch(/^lucid-[1-8]$/);
    }

    const deposit = calculateDailyBalance(null, {
      amountInCents: 500_000,
      kind: "deposit",
    });
    const brokerBalance = calculateDailyBalance(deposit.balanceInCents, {
      balanceInCents: 550_000,
      kind: "balance_update",
    });

    expect(deposit).toEqual({
      balanceInCents: 500_000,
      operatingResultInCents: null,
    });
    expect(brokerBalance).toEqual({
      balanceInCents: 550_000,
      operatingResultInCents: 50_000,
    });

    const participantIds = [
      accountIds[0],
      accountIds[3],
      accountIds[6],
      accountIds[7],
    ];
    const allocations = allocateResultEqually(
      brokerBalance.operatingResultInCents ?? 0,
      participantIds[0],
      participantIds.slice(1),
    );

    expect(allocations).toEqual([
      { accountId: "lucid-1", amountInCents: 12_500, role: "leader" },
      { accountId: "lucid-4", amountInCents: 12_500, role: "replica" },
      { accountId: "lucid-7", amountInCents: 12_500, role: "replica" },
      { accountId: "lucid-8", amountInCents: 12_500, role: "replica" },
    ]);
    expect(allocations.map((allocation) => allocation.accountId)).not.toContain(
      "lucid-2",
    );

    const entries: OperationRegisterEntry[] = allocations.map(
      (allocation, index) => {
        const brokerEntry = toBrokerEntry(allocation.amountInCents);
        if (brokerEntry.destination === "NONE") {
          throw new Error("El caso confirmado debe producir un resultado broker.");
        }

        return {
          accountId: allocation.accountId,
          accountReference: Number(allocation.accountId.split("-")[1]),
          companyId: "lucid",
          companyName: "LUCID",
          dailyControlId: "control-2",
          destination:
            brokerEntry.destination === "NETO_BROKER_POSITIVE"
              ? "NETO BROKER +"
              : "NETO BROKER -",
          id: `entry-${index + 1}`,
          magnitudeInCents: brokerEntry.magnitudeInCents,
          operatedOn: "2026-08-14",
          participantRole: allocation.role,
          phase: "Evaluacion",
        };
      },
    );

    expect(summarizeBrokerEntries(entries)).toEqual({
      entryCount: 4,
      negativeInCents: 0,
      netInCents: 50_000,
      positiveInCents: 50_000,
    });

    expect(
      buildProgressSummary({
        accountStates: Array.from({ length: 8 }, () => "virgin" as const),
        controls: [
          {
            balanceInCents: deposit.balanceInCents,
            kind: "deposit",
            movementInCents: 500_000,
            operatedOn: "2026-08-14",
            operatingResultInCents: null,
          },
          {
            balanceInCents: brokerBalance.balanceInCents,
            kind: "balance_update",
            movementInCents: null,
            operatedOn: "2026-08-14",
            operatingResultInCents: brokerBalance.operatingResultInCents,
          },
        ],
        operationEntryCount: entries.length,
        purchaseCostsInCents: Array.from({ length: 8 }, () => 8_900),
      }),
    ).toEqual({
      accountCount: 8,
      accountStates: { closed: 0, live: 0, virgin: 8 },
      brokerBalanceInCents: 550_000,
      brokerBalanceUpdatedOn: "2026-08-14",
      controlCount: 2,
      depositsInCents: 500_000,
      operatingResultInCents: 50_000,
      operationEntryCount: 4,
      purchaseCostInCents: 71_200,
      withdrawalsInCents: 0,
    });
  });
});

