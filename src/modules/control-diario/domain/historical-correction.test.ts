import { describe, expect, it } from "vitest";

import { recalculateAfterBalanceCorrection } from "./historical-correction";

describe("corrección histórica de saldo", () => {
  it("conserva el resultado independiente al corregir un saldo anterior", () => {
    const result = recalculateAfterBalanceCorrection([
      { balanceAfterInCents: 500000, id: "opening", kind: "deposit", movementInCents: 500000, participantCount: 0 },
      { balanceAfterInCents: 483282, id: "covered", kind: "balance_update", movementInCents: null, participantCount: 1 },
      { balanceAfterInCents: 484442, id: "standalone", kind: "balance_update", movementInCents: null, participantCount: 0, isUncovered: true, operatingResultInCents: 1160 },
      { balanceAfterInCents: 535502, id: "next", kind: "balance_update", movementInCents: null, participantCount: 1 },
    ], "covered", 483382);
    expect(result[2]).toMatchObject({ balanceBeforeInCents: 483382, balanceAfterInCents: 484542, operatingResultInCents: 1160 });
    expect(result[3].operatingResultInCents).toBe(50960);
  });
  it("no permite cambiar el importe recibido de un trade sin cobertura por corrección de saldo", () => {
    expect(() => recalculateAfterBalanceCorrection([
      { balanceAfterInCents: 10000, id: "opening", kind: "deposit", movementInCents: 10000, participantCount: 0 },
      { balanceAfterInCents: 11160, id: "standalone", kind: "balance_update", movementInCents: null, participantCount: 0, isUncovered: true, operatingResultInCents: 1160 },
    ], "standalone", 11200)).toThrow("conserva el importe");
  });
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

  it("permite una corrección cuyo reparto requiere redondeo", () => {
    const result = recalculateAfterBalanceCorrection([
      { balanceAfterInCents: 500_000, id: "deposit", kind: "deposit", movementInCents: 500_000, participantCount: 0 },
      { balanceAfterInCents: 560_000, id: "balance-1", kind: "balance_update", movementInCents: null, participantCount: 3 },
    ], "balance-1", 550_002);

    expect(result[1].operatingResultInCents).toBe(50_002);
  });

  it("permite preparar un reparto excepcional aunque el total no sea divisible", () => {
    const result = recalculateAfterBalanceCorrection([
      { balanceAfterInCents: 500_000, id: "deposit", kind: "deposit", movementInCents: 500_000, participantCount: 0 },
      { balanceAfterInCents: 560_000, hasCustomAllocation: true, id: "balance-1", kind: "balance_update", movementInCents: null, participantCount: 3 },
    ], "balance-1", 550_002);

    expect(result[1].operatingResultInCents).toBe(50_002);
  });
});
