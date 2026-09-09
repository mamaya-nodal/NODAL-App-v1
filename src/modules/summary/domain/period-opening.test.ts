import { describe, expect, it } from "vitest";

import { buildPeriodOpening } from "./period-opening";

describe("period opening", () => {
  it("carries the previous closing balances and accumulated economics", () => {
    const opening = buildPeriodOpening({
      currentPeriodId: "august",
      periodIdsInOrder: ["july", "august"],
      purchases: [
        { fundsOrigin: "Aporte trader", periodId: "july", priceInCents: 10_000 },
        { fundsOrigin: "Saldo generado", periodId: "july", priceInCents: 5_000 },
      ],
      controls: [
        { balanceAfterInCents: 500_000, controlNumber: 1, kind: "deposit", movementInCents: 500_000, operatingResultInCents: null, originDestination: "Aporte trader", periodId: "july" },
        { balanceAfterInCents: 530_000, controlNumber: 2, kind: "balance_update", movementInCents: null, operatingResultInCents: 30_000, originDestination: null, periodId: "july" },
      ],
      fundingWithdrawals: [{ amountInCents: 20_000, collectedOn: null, periodId: "july" }],
      walletMovements: [],
    });

    expect(opening).toEqual({
      accumulatedResultInCents: 35_000,
      brokerBalanceInCents: 530_000,
      capitalNetInCents: 510_000,
      fundingPendingInCents: 20_000,
      walletBalanceInCents: -5_000,
    });
  });
});
