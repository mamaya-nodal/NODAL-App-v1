import type { OperationalOpeningSnapshot } from "./operational-summary";

export type OpeningAccountStage = "evaluation" | "funded" | "virgin";

export type OpeningAccountBatch = Readonly<{
  accountCount: number;
  accountSizeInCents: number;
  companyName: string;
  costPerAccountInCents: number;
  currentCashValueInCents: number | null;
  stage: OpeningAccountStage;
}>;

export type PeriodOpeningRecord = Readonly<{
  batches: OpeningAccountBatch[];
  brokerBalanceInCents: number | null;
  closedAccountsReference: number;
  contributedCapitalInCents: number;
  cutoverDate: string;
  floatingInCents: number;
  fundedAccounts: number;
  fundingPendingInCents: number;
  id: string;
  liveEvaluationAccounts: number;
  mode: "reconstruct" | "zero";
  personalWithdrawalsInCents: number;
  priorRealizedResultInCents: number;
  virginAccounts: number;
  walletBalanceInCents: number;
}>;

export function operationalOpeningFromRecord(record: PeriodOpeningRecord): OperationalOpeningSnapshot {
  const capitalNetInCents = record.mode === "zero"
    ? record.contributedCapitalInCents + record.walletBalanceInCents
    : record.contributedCapitalInCents - record.personalWithdrawalsInCents;

  return {
    accountStates: {
      closed: record.closedAccountsReference,
      live: record.liveEvaluationAccounts + record.fundedAccounts,
      virgin: record.virginAccounts,
    },
    accumulatedResultInCents: record.priorRealizedResultInCents + record.floatingInCents,
    brokerBalanceInCents: record.brokerBalanceInCents,
    capitalNetInCents,
    floatingInCents: Math.abs(record.floatingInCents),
    fundingPendingInCents: record.fundingPendingInCents,
    walletBalanceInCents: record.walletBalanceInCents,
  };
}

