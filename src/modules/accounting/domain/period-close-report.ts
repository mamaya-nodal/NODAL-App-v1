import { portion } from "@/modules/admin/domain/desks";

export type PeriodCloseReportOperation = Readonly<{
  accountCount: number;
  accounts: readonly string[];
  brokerAccount: string | null;
  company: string;
  executionCount: number;
  finalResultInCents: number;
  identityName: string;
  instruments: readonly string[];
  openedAt: string;
  phaseDay: string;
}>;

export type PeriodCloseReportIdentity = Readonly<{
  accountCount: number;
  gainInCents: number;
  id: string | null;
  name: string;
  payoutsByCompany: readonly Readonly<{ company: string; count: number }>[];
}>;

export type PeriodCloseReportDeskRow = Readonly<{
  accountsClosed: number;
  administratorBps: number;
  administratorCommissionInCents: number;
  billedInCents: number;
  memberBps: number;
  memberCommissionInCents: number;
  memberName: string;
  nodalBps: number;
  nodalCommissionInCents: number;
}>;

export type PeriodCloseReportSnapshot = Readonly<{
  closure: Readonly<{
    closedAt: string;
    id: string;
    status: string;
    version: number;
  }>;
  desk: Readonly<{
    name: string;
    rows: readonly PeriodCloseReportDeskRow[];
  }> | null;
  identities: readonly PeriodCloseReportIdentity[];
  operations: readonly PeriodCloseReportOperation[];
  owner: Readonly<{
    email: string;
    id: string;
    name: string;
  }>;
  period: Readonly<{
    id: string;
    modality: "practice" | "real";
    month: string;
    operationalStartOn: string;
    scheduledCloseAt: string;
  }>;
  schemaVersion: 1;
  summary: Readonly<{
    accountStates: Readonly<{ closed: number; live: number; virgin: number }>;
    brokerBalanceInCents: number | null;
    commissionInCents: number;
    commissionRateLabel: string;
    floatingInCents: number;
    fundingPendingInCents: number;
    positionObservableInCents: number;
    realizedGainInCents: number;
    traderGainInCents: number;
    walletBalanceInCents: number;
  }>;
}>;

export function splitDeskMemberBilling(input: Readonly<{
  billedInCents: number;
  generatedCommissionBps: number;
  nodalShareOfCommissionBps: number;
}>): Readonly<{
  administratorBps: number;
  administratorCommissionInCents: number;
  memberBps: number;
  memberCommissionInCents: number;
  nodalBps: number;
  nodalCommissionInCents: number;
}> {
  const billed = Math.max(0, input.billedInCents);
  const generatedCommission = portion(billed, input.generatedCommissionBps);
  const nodalCommission = portion(generatedCommission, input.nodalShareOfCommissionBps);
  const administratorCommission = generatedCommission - nodalCommission;
  const memberCommission = billed - generatedCommission;
  const nodalBps = billed === 0 ? 0 : Math.round((nodalCommission * 10_000) / billed);
  const administratorBps = input.generatedCommissionBps - nodalBps;
  return {
    administratorBps,
    administratorCommissionInCents: administratorCommission,
    memberBps: 10_000 - input.generatedCommissionBps,
    memberCommissionInCents: memberCommission,
    nodalBps,
    nodalCommissionInCents: nodalCommission,
  };
}
