import { describe, expect, it } from "vitest";

import { recalculateAfterBalanceCorrection } from "./historical-correction";

describe("corrección histórica de saldo", () => {
  it("recalcula el saldo corregido y el resultado del siguiente saldo absoluto", () => {
    const result = recalculateAfterBalanceCorrection([
      { balanceAfterInCents: 500_000, id: "deposit", kind: "deposit", movementInCents: 500_000, participantCount: 0 },
      { balanceAfterInCents: 560_000, id: "balance-1", kind: "balance_update", movementInCents: null, participantCount: 3 },
      { balanceAfterInCents: 590_000, id: "balance-2", kind: "balance_update", movementInCents: null, participantCount: 3 },
    ], "balance-1", 551_000);

    expect(result[1]).toMatchObject({ balanceAfterInCents: 551_000, operatingResultInCents: 51_000 });
    expect(result[2]).toMatchObject({ balanceBeforeInCents: 551_000, operatingResultInCents: 39_000 });
  });

  it("recalcula depósitos y retiros posteriores antes del siguiente saldo", () => {
    const result = recalculateAfterBalanceCorrection([
      { balanceAfterInCents: 500_000, id: "deposit", kind: "deposit", movementInCents: 500_000, participantCount: 0 },
      { balanceAfterInCents: 550_000, id: "balance-1", kind: "balance_update", movementInCents: null, participantCount: 1 },
      { balanceAfterInCents: 540_000, id: "withdrawal", kind: "withdrawal", movementInCents: 10_000, participantCount: 0 },
      { balanceAfterInCents: 560_000, id: "deposit-2", kind: "deposit", movementInCents: 20_000, participantCount: 0 },
    ], "balance-1", 530_000);

    expect(result[2].balanceAfterInCents).toBe(520_000);
    expect(result[3].balanceAfterInCents).toBe(540_000);
  });

  it("bloquea toda la corrección si un reparto posterior deja de cerrar", () => {
    expect(() => recalculateAfterBalanceCorrection([
      { balanceAfterInCents: 500_000, id: "deposit", kind: "deposit", movementInCents: 500_000, participantCount: 0 },
      { balanceAfterInCents: 560_000, id: "balance-1", kind: "balance_update", movementInCents: null, participantCount: 3 },
    ], "balance-1", 550_002)).toThrow("centavos exactos");
  });
});
