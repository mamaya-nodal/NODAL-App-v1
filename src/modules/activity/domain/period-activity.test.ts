import { describe, expect, it } from "vitest";

import {
  buildPeriodActivityItem,
  type PeriodActivityRow,
} from "./period-activity";

const baseRow: PeriodActivityRow = {
  accountReference: 1,
  action: "daily_control_confirmed",
  auditEventId: 10,
  balanceAfterInCents: 550_000,
  companyName: "LUCID",
  controlKind: "balance_update",
  controlNumber: 2,
  fundsOrigin: null,
  occurredAt: "2026-08-14T15:30:00Z",
  operatedOn: "2026-08-14",
  phase: "Evaluation",
  primaryAmountInCents: 50_000,
  purchaseNumber: null,
  reason: null,
};

describe("period activity", () => {
  it("explains an original broker balance without calling it a correction", () => {
    expect(buildPeriodActivityItem(baseRow)).toMatchObject({
      amountInCents: 50_000,
      balanceAfterInCents: 550_000,
      correction: false,
      reference: "Control Diario 2",
      subtitle: "LUCID · Cuenta 1 · Evaluation",
      title: "Saldo broker confirmado",
    });
  });

  it("separates a correction and preserves its reason", () => {
    expect(
      buildPeriodActivityItem({
        ...baseRow,
        action: "daily_control_balance_corrected_with_allocations",
        primaryAmountInCents: null,
        reason: "La réplica 3 informó un resultado diferente",
      }),
    ).toMatchObject({
      amountInCents: null,
      correction: true,
      reason: "La réplica 3 informó un resultado diferente",
      subtitle: "Saldo y distribución por cuenta recalculados",
      title: "Saldo broker corregido",
    });
  });

  it("shows a purchase with its exact account and funds origin", () => {
    expect(
      buildPeriodActivityItem({
        ...baseRow,
        action: "purchase_created",
        controlKind: null,
        controlNumber: null,
        fundsOrigin: "Aporte trader",
        primaryAmountInCents: 8_900,
        purchaseNumber: 4,
      }),
    ).toMatchObject({
      amountInCents: 8_900,
      reference: "Compra 4",
      subtitle: "LUCID · Cuenta 1 · Aporte trader",
      title: "Compra registrada",
    });
  });
});

