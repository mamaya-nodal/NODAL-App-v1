import type { FundingWithdrawal } from "./operational-summary";

export type PeriodEarnings = Readonly<{
  deskAdministrationInCents: number | null;
  level: number | null;
  ownOperationsInCents: number;
  totalInCents: number;
}>;

export type PersonalDashboardHistoryPoint = Readonly<{
  billingInCents: number;
  earningsInCents: number;
  periodMonth: string;
}>;

export type PersonalDashboardCapabilities = Readonly<{
  identities?: Readonly<{
    active: number;
    capacity: number;
    payoutTotalInCents: number;
  }>;
  managedDesk?: Readonly<{
    billingInCents: number;
    capacity: number;
    users: number;
  }>;
}>;

export type PersonalDashboardData = Readonly<{
  capabilities?: PersonalDashboardCapabilities;
  billingInCents: number;
  earnings: PeriodEarnings;
  history: PersonalDashboardHistoryPoint[];
}>;

function assertMoney(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error("Invalid dashboard amount");
}

export function buildPeriodEarnings(input: Readonly<{
  deskAdministrationInCents?: number | null;
  level?: number | null;
  ownOperationsInCents: number;
}>): PeriodEarnings {
  const deskAdministrationInCents = input.deskAdministrationInCents ?? null;
  assertMoney(input.ownOperationsInCents);
  if (deskAdministrationInCents !== null) assertMoney(deskAdministrationInCents);
  return {
    deskAdministrationInCents,
    level: input.level ?? null,
    ownOperationsInCents: input.ownOperationsInCents,
    totalInCents:
      input.ownOperationsInCents +
      (deskAdministrationInCents ?? 0),
  };
}

export function payoutDashboardSummary(withdrawals: readonly FundingWithdrawal[]) {
  return {
    count: withdrawals.length,
    pendingCount: withdrawals.filter((withdrawal) => withdrawal.collectedOn === null).length,
    totalInCents: withdrawals.reduce((total, withdrawal) => total + withdrawal.amountInCents, 0),
  };
}
