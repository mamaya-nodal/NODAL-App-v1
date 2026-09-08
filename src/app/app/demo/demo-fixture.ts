import { calculateAccountResult, type AccountPhaseWithdrawal } from "@/modules/operations/domain/account-phase-results";
import type { OperationRegisterEntry } from "@/modules/operations/domain/operation-register";
import { buildCapitalHistory, buildHomePerformance, type CapitalHistoryPoint, type HomePerformance } from "@/modules/summary/domain/home-dashboard";
import { applyIndividualCommission } from "@/modules/summary/domain/individual-commission";
import {
  bonusBps,
  calculateDeskOverview,
  ROOT_DESK,
  type Desk,
  type DeskTerms,
  type Person,
  type UserTerms,
} from "@/modules/admin/domain/desks";
import {
  buildPeriodEarnings,
  type PersonalDashboardData,
} from "@/modules/summary/domain/personal-dashboard";
import {
  buildOperationalSummary,
  type FundingWithdrawal,
  type OperationalSummary,
  type SummaryAccount,
  type SummaryControl,
  type WalletMovement,
} from "@/modules/summary/domain/operational-summary";

export type DemoAccountStage = "Evaluation" | "Funded" | "Live";
export type DemoAccountState = SummaryAccount["state"];

export type DemoAccount = SummaryAccount & Readonly<{
  company: "Lucid" | "Tradeify";
  externalId: string;
  openedOn: string;
  periodLabel: "Agosto 2026" | "Julio 2026";
  resultInCents: number;
  stage: DemoAccountStage;
  state: DemoAccountState;
  trades: number;
}>;

export type DemoControl = SummaryControl & Readonly<{
  id: string;
  operatedOn: string;
}>;

export type DemoPeriod = Readonly<{
  accounts: DemoAccount[];
  controls: DemoControl[];
  entries: OperationRegisterEntry[];
  fundingWithdrawals: FundingWithdrawal[];
  id: "august" | "july";
  label: "Agosto 2026" | "Julio 2026";
  month: "2026-08-01" | "2026-07-01";
  performance: HomePerformance;
  phaseWithdrawals: AccountPhaseWithdrawal[];
  summary: OperationalSummary;
  walletMovements: WalletMovement[];
}>;

const accountPriceInCents = 10_520;
const individualCommissionBps = 5_000;
const stages: DemoAccountStage[] = ["Evaluation", "Funded", "Evaluation", "Live", "Funded"];

function distribute(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => base + (index < total - base * count ? 1 : 0));
}

function distributeOperatingResult(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const offsets = [-16_000, -6_000, 3_000, 8_000, 11_000];
  const values = Array.from({ length: count }, (_, index) => base + offsets[index % offsets.length]);
  values[values.length - 1] += total - values.reduce((sum, value) => sum + value, 0);
  return values;
}

function buildAccounts(input: Readonly<{
  closedCount: number;
  closedGainInCents: number;
  liveCount: number;
  liveLossInCents: number;
  periodId: DemoPeriod["id"];
  periodLabel: DemoPeriod["label"];
  startIndex: number;
  virginCount: number;
}>): DemoAccount[] {
  const closedResults = distribute(input.closedGainInCents, input.closedCount);
  const liveLosses = distribute(input.liveLossInCents, input.liveCount);
  const total = input.closedCount + input.liveCount + input.virginCount;

  return Array.from({ length: total }, (_, localIndex) => {
    const number = input.startIndex + localIndex;
    const state: DemoAccountState = localIndex < input.closedCount
      ? "closed"
      : localIndex < input.closedCount + input.liveCount
        ? "live"
        : "virgin";
    const company = number <= 28 ? "Lucid" : "Tradeify";
    const prefix = company === "Lucid" ? "LFE" : "TFY";
    const resultInCents = state === "closed"
      ? closedResults[localIndex]
      : state === "live"
        ? -liveLosses[localIndex - input.closedCount]
        : 0;

    return {
      company,
      externalId: `${prefix}${String(5_088_201_070_000 + number).padStart(13, "0")}`,
      fundsOrigin: "Aporte trader",
      id: `${input.periodId}-account-${number}`,
      openedOn: input.periodId === "july"
        ? `${String(3 + (localIndex % 21)).padStart(2, "0")}/07/2026`
        : `${String(2 + (localIndex % 24)).padStart(2, "0")}/08/2026`,
      periodLabel: input.periodLabel,
      priceInCents: accountPriceInCents,
      resultInCents,
      stage: state === "virgin" ? "Evaluation" : stages[localIndex % stages.length],
      state,
      stateOrigin: "automatic",
      trades: state === "virgin" ? 0 : 1 + (localIndex % 6),
    };
  });
}

function entry(input: Readonly<{
  account: DemoAccount;
  destination: OperationRegisterEntry["destination"];
  magnitudeInCents: number;
  phase: OperationRegisterEntry["phase"];
  suffix: string;
}>): OperationRegisterEntry {
  const accountReference = Number(input.account.id.match(/(\d+)$/)?.[1] ?? 0);
  return {
    accountId: input.account.id,
    accountReference,
    companyId: input.account.company.toLowerCase(),
    companyName: input.account.company,
    dailyControlId: `${input.account.id}-control`,
    destination: input.destination,
    id: `${input.account.id}-${input.suffix}`,
    magnitudeInCents: input.magnitudeInCents,
    operatedOn: input.account.openedOn.split("/").reverse().join("-"),
    participantRole: "leader",
    phase: input.phase,
  };
}

function buildEntries(accounts: DemoAccount[]): OperationRegisterEntry[] {
  return accounts.flatMap((account) => {
    if (account.state === "virgin") return [];

    if (account.stage === "Evaluation") {
      if (account.resultInCents >= 0) {
        return [entry({ account, destination: "NETO BROKER +", magnitudeInCents: account.priceInCents + account.resultInCents, phase: "Evaluacion", suffix: "evaluation" })];
      }
      const lossInCents = Math.abs(account.resultInCents);
      return lossInCents >= account.priceInCents
        ? [entry({ account, destination: "NETO BROKER -", magnitudeInCents: lossInCents - account.priceInCents, phase: "Evaluacion", suffix: "evaluation" })]
        : [entry({ account, destination: "NETO BROKER +", magnitudeInCents: account.priceInCents - lossInCents, phase: "Evaluacion", suffix: "evaluation" })];
    }

    const activePhase: OperationRegisterEntry["phase"] = account.stage === "Funded" ? "Primera vuelta" : "Segunda vuelta";
    return [
      entry({ account, destination: "NETO BROKER +", magnitudeInCents: account.priceInCents, phase: "Evaluacion", suffix: "evaluation" }),
      entry({
        account,
        destination: account.resultInCents >= 0 ? "NETO BROKER +" : "NETO BROKER -",
        magnitudeInCents: Math.abs(account.resultInCents),
        phase: activePhase,
        suffix: "active-phase",
      }),
    ];
  });
}

function buildControls(input: Readonly<{
  capitalDepositInCents: number;
  operationCount: number;
  operatingResultInCents: number;
  periodId: DemoPeriod["id"];
}>): DemoControl[] {
  const month = input.periodId === "july" ? "07" : "08";
  const days = input.periodId === "july" ? ["04", "11", "18", "25", "29"] : ["03", "10", "17", "24", "28"];
  const results = distributeOperatingResult(input.operatingResultInCents, input.operationCount);
  let balanceInCents = input.capitalDepositInCents;
  const deposit: DemoControl = {
    balanceAfterInCents: balanceInCents,
    controlNumber: 0,
    id: `${input.periodId}-deposit`,
    kind: "deposit",
    movementInCents: input.capitalDepositInCents,
    operatedOn: `2026-${month}-01`,
    operatingResultInCents: null,
    originDestination: "Aporte trader",
  };
  const operations = results.map((resultInCents, index): DemoControl => {
    balanceInCents += resultInCents;
    const dayIndex = Math.min(days.length - 1, Math.floor(index / Math.ceil(results.length / days.length)));
    return {
      balanceAfterInCents: balanceInCents,
      controlNumber: index + 1,
      id: `${input.periodId}-operation-${index + 1}`,
      kind: "balance_update",
      movementInCents: null,
      operatedOn: `2026-${month}-${days[dayIndex]}`,
      operatingResultInCents: resultInCents,
      originDestination: null,
    };
  });
  return [deposit, ...operations];
}

function buildPeriod(input: Readonly<{
  accounts: DemoAccount[];
  capitalDepositInCents: number;
  fundingWithdrawals: FundingWithdrawal[];
  id: DemoPeriod["id"];
  label: DemoPeriod["label"];
  month: DemoPeriod["month"];
  operationCount: number;
  periodResultInCents: number;
}>): DemoPeriod {
  const entries = buildEntries(input.accounts);
  const phaseWithdrawals: AccountPhaseWithdrawal[] = [];
  const walletMovements: WalletMovement[] = [];
  const totalPurchases = input.accounts.reduce((sum, account) => sum + account.priceInCents, 0);
  const approvedFunding = input.fundingWithdrawals.reduce((sum, withdrawal) => sum + withdrawal.amountInCents, 0);
  const operatingResultInCents = input.periodResultInCents + totalPurchases - approvedFunding;
  const controls = buildControls({
    capitalDepositInCents: input.capitalDepositInCents,
    operationCount: input.operationCount,
    operatingResultInCents,
    periodId: input.id,
  });
  const summary = applyIndividualCommission(buildOperationalSummary({
    accounts: input.accounts,
    controls,
    entries,
    fundingWithdrawals: input.fundingWithdrawals,
    phaseWithdrawals,
    walletMovements,
  }), individualCommissionBps);
  const performance = buildHomePerformance(controls.map((control) => ({
    operatedOn: control.operatedOn,
    resultInCents: control.operatingResultInCents,
  })));

  return {
    accounts: input.accounts,
    controls,
    entries,
    fundingWithdrawals: input.fundingWithdrawals,
    id: input.id,
    label: input.label,
    month: input.month,
    performance,
    phaseWithdrawals,
    summary,
    walletMovements,
  };
}

const julyAccounts = buildAccounts({
  closedCount: 18,
  closedGainInCents: 1_050_000,
  liveCount: 0,
  liveLossInCents: 0,
  periodId: "july",
  periodLabel: "Julio 2026",
  startIndex: 1,
  virginCount: 0,
});

const augustAccounts = buildAccounts({
  closedCount: 16,
  closedGainInCents: 1_200_000,
  liveCount: 8,
  liveLossInCents: 184_879,
  periodId: "august",
  periodLabel: "Agosto 2026",
  startIndex: 19,
  virginCount: 1,
});

export const julyDemo = buildPeriod({
  accounts: julyAccounts,
  capitalDepositInCents: 610_640,
  fundingWithdrawals: [
    { accountId: julyAccounts[0].id, amountInCents: 180_000, approvedOn: "2026-07-25", collectedOn: "2026-07-27", id: "july-payout-1" },
  ],
  id: "july",
  label: "Julio 2026",
  month: "2026-07-01",
  operationCount: 31,
  periodResultInCents: 1_050_000,
});

export const augustDemo = buildPeriod({
  accounts: augustAccounts,
  capitalDepositInCents: 737_000,
  fundingWithdrawals: [
    { accountId: augustAccounts[0].id, amountInCents: 180_000, approvedOn: "2026-08-22", collectedOn: "2026-08-25", id: "august-payout-1" },
    { accountId: augustAccounts[1].id, amountInCents: 180_000, approvedOn: "2026-08-28", collectedOn: null, id: "august-payout-2" },
  ],
  id: "august",
  label: "Agosto 2026",
  month: "2026-08-01",
  operationCount: 48,
  periodResultInCents: 1_004_601,
});

export const demoPeriods = [julyDemo, augustDemo] as const;
export const demoAccounts = [...julyDemo.accounts, ...augustDemo.accounts];

const demoUserId = "demo-user";
const managedDeskId = "demo-managed-desk";
const firstChildDeskId = "demo-child-desk-1";
const secondChildDeskId = "demo-child-desk-2";
const demoDesks: Desk[] = [
  { created_at: "2026-01-01", id: ROOT_DESK, name: "Mesa principal NODAL", parent_id: null },
  { created_at: "2026-01-02", id: managedDeskId, name: "Mesa Demo", parent_id: ROOT_DESK },
  { created_at: "2026-01-03", id: firstChildDeskId, name: "Mesa referida 1", parent_id: managedDeskId },
  { created_at: "2026-01-04", id: secondChildDeskId, name: "Mesa referida 2", parent_id: managedDeskId },
];

function demoDeskEconomy(period: DemoPeriod, memberGrossInCents: number, childMemberGrossInCents: number) {
  const managedMembers: Person[] = Array.from({ length: 3 }, (_, index) => ({
    access: "active",
    email: `member-${index + 1}@nodal.test`,
    gross: memberGrossInCents,
    id: `managed-member-${index + 1}`,
    legacyCommission: Math.round(memberGrossInCents / 2),
    master: false,
    name: `Integrante ${index + 1}`,
  }));
  const childMembers: Person[] = [firstChildDeskId, secondChildDeskId].flatMap((deskId, deskIndex) =>
    Array.from({ length: 3 }, (_, memberIndex) => ({
      access: "active",
      email: `child-${deskIndex + 1}-member-${memberIndex + 1}@nodal.test`,
      gross: childMemberGrossInCents,
      id: `${deskId}-member-${memberIndex + 1}`,
      legacyCommission: Math.round(childMemberGrossInCents / 2),
      master: false,
      name: `Integrante referida ${deskIndex + 1}.${memberIndex + 1}`,
    })),
  );
  const people: Person[] = [
    { access: "active", email: "demo@nodal.test", gross: period.summary.realizedGainInCents, id: demoUserId, legacyCommission: period.summary.commissionInCents, master: false, name: "Usuario Demo" },
    ...managedMembers,
    ...childMembers,
  ];
  const effectiveMonth = "2026-01-01";
  const userTerms: UserTerms[] = people.map((person) => ({
    bonus_enabled: person.id === demoUserId,
    commission_bps: 5_000,
    desk_id: person.id === demoUserId
      ? ROOT_DESK
      : person.id.startsWith(`${firstChildDeskId}-member-`)
        ? firstChildDeskId
        : person.id.startsWith(`${secondChildDeskId}-member-`)
          ? secondChildDeskId
          : managedDeskId,
    effective_month: effectiveMonth,
    level: person.id === demoUserId ? 2 : 1,
    state: "active",
    user_id: person.id,
  }));
  const deskTerms: DeskTerms[] = [
    { active: true, desk_id: ROOT_DESK, effective_month: effectiveMonth, manager_id: null, nodal_bps: 10_000 },
    { active: true, desk_id: managedDeskId, effective_month: effectiveMonth, manager_id: demoUserId, nodal_bps: 3_000 },
    { active: true, desk_id: firstChildDeskId, effective_month: effectiveMonth, manager_id: "managed-member-1", nodal_bps: 3_500 },
    { active: true, desk_id: secondChildDeskId, effective_month: effectiveMonth, manager_id: "managed-member-2", nodal_bps: 3_500 },
  ];
  const overview = calculateDeskOverview(demoDesks, deskTerms, people, userTerms, period.month);
  const user = overview.people.find((person) => person.id === demoUserId)!;
  const managedDesk = overview.desks.find((desk) => desk.id === managedDeskId);
  return {
    earnings: buildPeriodEarnings({
      deskAdministrationInCents: user.mesaIncome,
      level: user.terms?.level ?? null,
      ownOperationsInCents: user.ownIncome,
      referredDesksInCents: user.bonus,
    }),
    managedCapitalInCents: managedDesk?.gross ?? 0,
    managedUsers: managedDesk?.members.length ?? 0,
    referredDesks: managedDesk?.children.length ?? 0,
  };
}

const julyDeskEconomy = demoDeskEconomy(julyDemo, 800_000, 800_000);
const augustDeskEconomy = demoDeskEconomy(augustDemo, 1_000_000, 1_000_000);
const identityPayouts = [350_000, 420_000, 380_000, 460_000, 390_000, 500_000];

export const demoHomeDashboard: PersonalDashboardData = {
  capabilities: {
    identities: { active: identityPayouts.length, capacity: 20, payoutTotalInCents: identityPayouts.reduce((total, amount) => total + amount, 0) },
    managedDesk: { capitalNetInCents: augustDeskEconomy.managedCapitalInCents, capacity: 10, users: augustDeskEconomy.managedUsers },
    referredDesks: { bonusBps: bonusBps(augustDeskEconomy.referredDesks), capacity: 10, desks: augustDeskEconomy.referredDesks },
  },
  capitalNetInCents: augustDemo.summary.realizedGainInCents,
  earnings: augustDeskEconomy.earnings,
  history: [
    {
      capitalNetInCents: julyDemo.summary.realizedGainInCents,
      earningsInCents: julyDeskEconomy.earnings.totalInCents,
      periodMonth: julyDemo.month,
    },
    {
      capitalNetInCents: augustDemo.summary.realizedGainInCents,
      earningsInCents: augustDeskEconomy.earnings.totalInCents,
      periodMonth: augustDemo.month,
    },
  ],
};

export const currentDemoOperation = {
  accountId: augustAccounts.find((account) => account.state === "live")?.id ?? augustAccounts[0].id,
  cashValueInCents: augustDemo.summary.brokerBalanceInCents ?? 0,
  duration: "08:42",
  netLiquidationInCents: (augustDemo.summary.brokerBalanceInCents ?? 0) + 2_500,
} as const;

export const demoCapitalHistory: CapitalHistoryPoint[] = buildCapitalHistory({
  controls: demoPeriods.flatMap((period) => period.controls.map((control) => ({
    kind: control.kind,
    movementInCents: control.movementInCents,
    originDestination: control.originDestination,
    periodId: period.id,
  }))),
  periods: demoPeriods.map((period) => ({ id: period.id, periodMonth: period.month })),
  purchases: demoPeriods.flatMap((period) => period.accounts.map((account) => ({
    fundsOrigin: account.fundsOrigin,
    periodId: period.id,
    priceInCents: account.priceInCents,
  }))),
  walletMovements: [],
});

export function calculatedAccountResult(account: DemoAccount, period: DemoPeriod): number {
  const phaseResults = calculateAccountResult(
    period.entries.filter((item) => item.accountId === account.id),
    period.phaseWithdrawals.filter((item) => item.accountId === account.id),
    account.stateOrigin,
    account.priceInCents,
  ).phaseResults;
  return [...phaseResults].reverse().find((phase) => phase.totalGainInCents !== 0)?.totalGainInCents ?? 0;
}
