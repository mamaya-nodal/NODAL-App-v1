import type { FundingWithdrawal } from "./operational-summary";

export type PeriodEarnings = Readonly<{
  deskAdministrationInCents: number | null;
  level: number | null;
  ownOperationsInCents: number;
  referredDesksInCents: number | null;
  totalInCents: number;
}>;

export type PersonalDashboardHistoryPoint = Readonly<{
  capitalNetInCents: number;
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
    capitalNetInCents: number;
    capacity: number;
    users: number;
  }>;
  referredDesks?: Readonly<{
    bonusBps: number;
    capacity: number;
    desks: number;
  }>;
}>;

export type PersonalDashboardData = Readonly<{
  capabilities?: PersonalDashboardCapabilities;
  capitalNetInCents: number;
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
  referredDesksInCents?: number | null;
}>): PeriodEarnings {
  const deskAdministrationInCents = input.deskAdministrationInCents ?? null;
  const referredDesksInCents = input.referredDesksInCents ?? null;
  assertMoney(input.ownOperationsInCents);
  if (deskAdministrationInCents !== null) assertMoney(deskAdministrationInCents);
  if (referredDesksInCents !== null) assertMoney(referredDesksInCents);
  return {
    deskAdministrationInCents,
    level: input.level ?? null,
    ownOperationsInCents: input.ownOperationsInCents,
    referredDesksInCents,
    totalInCents:
      input.ownOperationsInCents +
      (deskAdministrationInCents ?? 0) +
      (referredDesksInCents ?? 0),
  };
}

export function payoutDashboardSummary(withdrawals: readonly FundingWithdrawal[]) {
  return {
    count: withdrawals.length,
    pendingCount: withdrawals.filter((withdrawal) => withdrawal.collectedOn === null).length,
    totalInCents: withdrawals.reduce((total, withdrawal) => total + withdrawal.amountInCents, 0),
  };
}
