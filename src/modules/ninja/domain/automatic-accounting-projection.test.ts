import { describe, expect, it } from "vitest";

import { projectAutomaticAccounting, type AutomaticAccountingMember } from "./automatic-accounting-projection";

const member = (accountId: string, allocatedBrokerResultInCents = 10_000): AutomaticAccountingMember => ({
  accountId,
  allocatedBrokerResultInCents,
  companyId: "company-1",
  periodId: "period-1",
  phase: "Evaluacion",
});

describe("automatic accounting projection", () => {
  it("prepara cinco cuentas compatibles sin exigir líder ni grupo", () => {
    const result = projectAutomaticAccounting({
      batchStatus: "ready",
      brokerClosingBalanceInCents: 5_050_000,
      brokerOpeningBalanceInCents: 5_000_000,
      brokerResultInCents: 50_000,
      expectedOpeningBalanceInCents: 5_000_000,
      members: Array.from({ length: 5 }, (_, index) => member(`account-${index}`)),
      technicalMemberCount: 5,
    });
    expect(result).toEqual({
      accountCount: 5,
      companyId: "company-1",
      periodId: "period-1",
      phase: "Evaluacion",
      reason: null,
      status: "shadow_ready",
    });
  });

  it("bloquea la escritura si falta el depósito inicial", () => {
    expect(projectAutomaticAccounting({
      batchStatus: "ready",
      brokerClosingBalanceInCents: 5_010_000,
      brokerOpeningBalanceInCents: 5_000_000,
      brokerResultInCents: 10_000,
      expectedOpeningBalanceInCents: null,
      members: [member("account-1")],
      technicalMemberCount: 1,
    })).toMatchObject({ reason: "Falta registrar el depósito inicial del broker", status: "blocked" });
  });

  it("bloquea cuentas de distintas empresas en vez de inventar una distribución", () => {
    expect(projectAutomaticAccounting({
      batchStatus: "ready",
      brokerClosingBalanceInCents: 5_020_000,
      brokerOpeningBalanceInCents: 5_000_000,
      brokerResultInCents: 20_000,
      expectedOpeningBalanceInCents: 5_000_000,
      members: [member("account-1"), { ...member("account-2"), companyId: "company-2" }],
      technicalMemberCount: 2,
    })).toMatchObject({ reason: "Las cuentas pertenecen a empresas distintas", status: "blocked" });
  });

  it("aplica el resultado de una subcuenta sobre el saldo broker agregado", () => {
    expect(projectAutomaticAccounting({
      batchStatus: "ready",
      brokerBalanceScope: "aggregate",
      brokerClosingBalanceInCents: 5_486_822,
      brokerOpeningBalanceInCents: 5_698_618,
      brokerResultInCents: -211_796,
      expectedOpeningBalanceInCents: 6_256_617,
      members: [member("account-1", -105_898), member("account-2", -105_898)],
      technicalMemberCount: 2,
    })).toMatchObject({ reason: null, status: "shadow_ready" });
  });

  it("sigue exigiendo que la subcuenta reconcilie su propio resultado", () => {
    expect(projectAutomaticAccounting({
      batchStatus: "ready",
      brokerBalanceScope: "aggregate",
      brokerClosingBalanceInCents: 5_486_800,
      brokerOpeningBalanceInCents: 5_698_618,
      brokerResultInCents: -211_796,
      expectedOpeningBalanceInCents: 6_256_617,
      members: [member("account-1", -105_898), member("account-2", -105_898)],
      technicalMemberCount: 2,
    })).toMatchObject({ reason: "El resultado broker no coincide con sus saldos", status: "blocked" });
  });

  it("espera las cuentas técnicas que todavía no fueron registradas", () => {
    expect(projectAutomaticAccounting({
      batchStatus: "ready",
      brokerClosingBalanceInCents: 5_020_000,
      brokerOpeningBalanceInCents: 5_000_000,
      brokerResultInCents: 20_000,
      expectedOpeningBalanceInCents: 5_000_000,
      members: [member("account-1"), member("account-2")],
      technicalMemberCount: 5,
    })).toMatchObject({
      accountCount: 2,
      reason: "No se pudo vincular 3 de las 5 cuentas prop. Revisá su registro.",
      status: "blocked",
    });
  });
});
