export type AutomaticAccountingMember = Readonly<{
  accountId: string;
  allocatedBrokerResultInCents: number;
  companyId: string;
  periodId: string;
  phase: "Evaluacion" | "Primera vuelta" | "Segunda vuelta" | "Tercera vuelta" | "Cuarta vuelta" | "Quinta vuelta" | null;
}>;

export type AutomaticAccountingProjection = Readonly<{
  accountCount: number;
  companyId: string | null;
  phase: Exclude<AutomaticAccountingMember["phase"], null> | null;
  periodId: string | null;
  reason: string | null;
  status: "blocked" | "shadow_ready";
}>;

type Input = Readonly<{
  batchStatus: "conflict" | "ready" | "unmatched";
  brokerBalanceScope?: "aggregate" | "single";
  brokerClosingBalanceInCents: number | null;
  brokerOpeningBalanceInCents: number | null;
  brokerResultInCents: number;
  expectedOpeningBalanceInCents: number | null;
  members: readonly AutomaticAccountingMember[];
  technicalMemberCount: number;
}>;

export function projectAutomaticAccounting(input: Input): AutomaticAccountingProjection {
  const base = { accountCount: input.members.length, companyId: null, phase: null, periodId: null };
  if (input.batchStatus !== "ready") {
    return { ...base, reason: input.batchStatus === "conflict" ? "Cobertura ambigua" : "Cobertura sin cuentas prop compatibles", status: "blocked" };
  }
  if (input.members.length !== input.technicalMemberCount) {
    const missing = Math.max(input.technicalMemberCount - input.members.length, 0);
    return {
      ...base,
      reason: `No se pudo vincular ${missing} de las ${input.technicalMemberCount} cuentas prop. Revisá su registro.`,
      status: "blocked",
    };
  }
  if (input.members.length === 0) {
    return { ...base, reason: "El lote no contiene cuentas prop", status: "blocked" };
  }

  const periodIds = new Set(input.members.map((member) => member.periodId));
  const companyIds = new Set(input.members.map((member) => member.companyId));
  if (input.members.some((member) => member.phase === null)) {
    return { ...base, reason: "Falta definir la vuelta contable de una cuenta", status: "blocked" };
  }
  const phases = new Set(input.members.map((member) => member.phase));
  if (periodIds.size !== 1) return { ...base, reason: "Las cuentas pertenecen a períodos distintos", status: "blocked" };
  if (companyIds.size !== 1) return { ...base, reason: "Las cuentas pertenecen a empresas distintas", status: "blocked" };
  if (phases.size !== 1) return { ...base, reason: "Las cuentas se encuentran en fases distintas", status: "blocked" };

  const periodId = input.members[0].periodId;
  const companyId = input.members[0].companyId;
  const phase = input.members[0].phase as Exclude<AutomaticAccountingMember["phase"], null>;
  const identified = { accountCount: input.members.length, companyId, periodId, phase };
  if (input.brokerOpeningBalanceInCents === null || input.brokerClosingBalanceInCents === null) {
    return { ...identified, reason: "Falta el saldo inicial o final de la cobertura", status: "blocked" };
  }
  if (input.expectedOpeningBalanceInCents === null) {
    return { ...identified, reason: "Falta registrar el depósito inicial del broker", status: "blocked" };
  }
  if (
    input.brokerBalanceScope !== "aggregate" &&
    input.brokerOpeningBalanceInCents !== input.expectedOpeningBalanceInCents
  ) {
    return { ...identified, reason: "El saldo inicial no coincide con el último saldo contable", status: "blocked" };
  }
  if (input.brokerClosingBalanceInCents - input.brokerOpeningBalanceInCents !== input.brokerResultInCents) {
    return { ...identified, reason: "El resultado broker no coincide con sus saldos", status: "blocked" };
  }
  const distributed = input.members.reduce((total, member) => total + member.allocatedBrokerResultInCents, 0);
  if (distributed - input.brokerResultInCents !== 0 && Math.abs(distributed - input.brokerResultInCents) > input.members.length) {
    return { ...identified, reason: "La distribución excede la diferencia de redondeo esperada", status: "blocked" };
  }
  return { ...identified, reason: null, status: "shadow_ready" };
}
