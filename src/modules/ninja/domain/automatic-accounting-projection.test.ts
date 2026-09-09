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
    })).toMatchObject({ reason: "Las cuentas pertenecen a empresas distintas", status: "blocked" });
  });
});
