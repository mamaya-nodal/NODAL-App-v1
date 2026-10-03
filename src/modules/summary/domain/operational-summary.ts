import {
  calculateAccountResult,
  type AccountPhaseWithdrawal,
} from "@/modules/operations/domain/account-phase-results";
import type { OperationRegisterEntry } from "@/modules/operations/domain/operation-register";
import type { AccountStateOrigin } from "@/modules/operations/domain/account-state";

export type SummaryAccount = Readonly<{
  id: string;
  priceInCents: number;
  /** La compra se descuenta una sola vez, en el período en que nació la cuenta. */
  purchaseBelongsToPeriod?: boolean;
  state: "virgin" | "live" | "closed";
  stateOrigin: AccountStateOrigin;
  fundsOrigin: "Aporte trader" | "Saldo generado";
}>;

export type SummaryControl = Readonly<{
  isUncovered?: boolean;
  balanceAfterInCents: number;
  controlNumber: number;
  kind: "deposit" | "withdrawal" | "balance_update";
  movementInCents: number | null;
  operatingResultInCents: number | null;
  originDestination: "Aporte trader" | "Saldo billetera" | "Retiro personal" | null;
  transferFeeInCents?: number;
}>;

export type WalletMovement = Readonly<{
  amountInCents: number;
  destinationWalletId?: string | null;
  feeInCents?: number;
  id: string;
  kind: "external_contribution" | "personal_withdrawal" | "prior_pending_collection" | "broker_to_wallet" | "wallet_to_broker" | "wallet_to_wallet";
  occurredOn: string;
  observation: string | null;
  walletId?: string;
}>;

export type FundingWithdrawal = Readonly<{
  accountId: string;
  amountInCents: number;
  approvedOn: string;
  collectedOn: string | null;
  feeInCents?: number;
  id: string;
  walletId?: string | null;
  phase?: AccountPhaseWithdrawal["phase"] | null;
}>;

export type OperationalOpeningSnapshot = Readonly<{
  liveResultInCents?: number;
  virginPriceInCents?: number;
  verified?: boolean;
  accumulatedClosedResultInCents?: number;
  accumulatedUncoveredResultInCents?: number;
  accumulatedFeesInCents?: number;
  accumulatedAdjustmentsInCents?: number;
  accumulatedBreakdownAvailable?: boolean;
  accountStates?: Readonly<{ virgin: number; live: number; closed: number }>;
  accumulatedResultInCents: number;
  brokerBalanceInCents: number | null;
  capitalNetInCents: number;
  floatingInCents?: number;
  gainReconciliationBaselineInCents?: number;
  fundingPendingInCents: number;
  walletBalanceInCents: number;
}>;

export type OperationalSummary = Readonly<{
  resultDetails?: Readonly<{
    verified: boolean;
    openingLiveResultInCents: number;
    openingVirginPriceInCents: number;
    openingAccumulatedResultInCents: number;
    liveResultInCents: number;
    brokerResultInCents: number;
    purchasesInCents: number;
    approvedPayoutsInCents: number;
    feesInCents: number;
    reconstructedPeriodResultInCents: number;
    accumulatedClosedResultInCents: number;
    accumulatedUncoveredResultInCents: number;
    accumulatedFeesInCents: number;
    accumulatedAdjustmentsInCents?: number;
    accumulatedBreakdownAvailable: boolean;
  }>;
  uncoveredBrokerResultInCents?: number;
  accountStates: Readonly<{ virgin: number; live: number; closed: number }>;
  accumulatedResultInCents: number;
  brokerBalanceInCents: number | null;
  capitalNetInCents: number;
  commissionInCents: number;
  commissionRateLabel: string;
  floatingInCents: number;
  fundingCollectedInCents: number;
  fundingPendingInCents: number;
  fundingWithdrawals: FundingWithdrawal[];
  manualAccountStateCount: number;
  periodResultInCents: number;
  positionDifferenceInCents: number;
  positionExpectedInCents: number;
  positionObservableInCents: number;
  priorPeriodCommissionAdjustmentInCents?: number;
  priorPeriodResultAdjustmentInCents?: number;
  realizedGainInCents: number;
  realizedReconciliationDifferenceInCents: number;
  traderGainInCents: number;
  virginPriceInCents: number;
  walletBalanceInCents: number;
  walletMovements: WalletMovement[];
}>;

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function calculateDeskCommission(realizedGainInCents: number): Readonly<{
  amountInCents: number;
  rateLabel: string;
}> {
  if (realizedGainInCents <= 0) return { amountInCents: 0, rateLabel: "Sin comisión" };
  if (realizedGainInCents < 1_000_000) {
    return { amountInCents: Math.min(Math.round(realizedGainInCents * 0.5), 440_000), rateLabel: "50% · tope US$ 4.400" };
  }
  if (realizedGainInCents < 1_500_000) {
    return { amountInCents: Math.min(Math.round(realizedGainInCents * 0.4), 550_000), rateLabel: "40% · tope US$ 5.500" };
  }
  if (realizedGainInCents < 3_500_000) {
    return { amountInCents: Math.round(realizedGainInCents * 0.35), rateLabel: "35%" };
  }
  return { amountInCents: Math.round(realizedGainInCents * 0.25), rateLabel: "25%" };
}

export function buildOperationalSummary(input: Readonly<{
  accounts: SummaryAccount[];
  controls: SummaryControl[];
  entries: OperationRegisterEntry[];
  fundingWithdrawals: FundingWithdrawal[];
  phaseWithdrawals: AccountPhaseWithdrawal[];
  opening?: OperationalOpeningSnapshot;
  walletMovements: WalletMovement[];
}>): OperationalSummary {
  const opening: OperationalOpeningSnapshot = input.opening ?? {
    accountStates: { closed: 0, live: 0, virgin: 0 },
    accumulatedResultInCents: 0,
    brokerBalanceInCents: null,
    capitalNetInCents: 0,
    floatingInCents: 0,
    fundingPendingInCents: 0,
    walletBalanceInCents: 0,
  };
  const accountTotals = input.accounts.map((account) => ({
    account,
    total: [...calculateAccountResult(
      input.entries.filter((entry) => entry.accountId === account.id),
      input.phaseWithdrawals.filter((withdrawal) => withdrawal.accountId === account.id),
      account.stateOrigin,
      account.priceInCents,
    ).phaseResults].reverse().find((phase) => phase.totalGainInCents !== 0)?.totalGainInCents ?? 0,
  }));
  const states = {
    closed: (opening.accountStates?.closed ?? 0) + input.accounts.filter((account) => account.state === "closed").length,
    live: (opening.accountStates?.live ?? 0) + input.accounts.filter((account) => account.state === "live").length,
    virgin: (opening.accountStates?.virgin ?? 0) + input.accounts.filter((account) => account.state === "virgin").length,
  };
  const manualAccountStateCount = input.accounts.filter((account) => account.stateOrigin !== "automatic").length;
  const realizedGainInCents = sum(accountTotals.filter(({ account }) => account.state === "closed").map(({ total }) => total));
  const liveResultInCents = -(opening.floatingInCents ?? 0)
    + sum(accountTotals.filter(({ account }) => account.state === "live").map(({ total }) => total));
  // Legacy snapshots store the magnitude; new displays use the signed result.
  const floatingInCents = Math.abs(liveResultInCents);
  const virginPriceInCents = sum(input.accounts.filter((account) => account.state === "virgin").map((account) => account.priceInCents));
  const orderedControls = [...input.controls].sort((left, right) => left.controlNumber - right.controlNumber);
  const brokerBalanceInCents = orderedControls.at(-1)?.balanceAfterInCents ?? opening.brokerBalanceInCents;
  const brokerOperatingResult = sum(orderedControls.map((control) => control.operatingResultInCents ?? 0));
  const uncoveredBrokerResultInCents = sum(orderedControls.filter((control) => control.isUncovered).map((control) => control.operatingResultInCents ?? 0));
  const purchasesForPeriod = input.accounts.filter((account) => account.purchaseBelongsToPeriod !== false);
  const totalPurchases = sum(purchasesForPeriod.map((account) => account.priceInCents));
  const approved = sum(input.fundingWithdrawals.map((withdrawal) => withdrawal.amountInCents));
  const collected = sum(input.fundingWithdrawals.filter((withdrawal) => withdrawal.collectedOn).map((withdrawal) => withdrawal.amountInCents));
  const collectedNet = sum(input.fundingWithdrawals.filter((withdrawal) => withdrawal.collectedOn).map((withdrawal) => withdrawal.amountInCents - (withdrawal.feeInCents ?? 0)));
  const generatedPurchases = sum(purchasesForPeriod.filter((account) => account.fundsOrigin === "Saldo generado").map((account) => account.priceInCents));
  const brokerContribution = sum(orderedControls.filter((control) => control.kind === "deposit" && control.originDestination === "Aporte trader").map((control) => control.movementInCents ?? 0));
  const brokerPersonalWithdrawal = sum(orderedControls.filter((control) => control.kind === "withdrawal" && control.originDestination === "Retiro personal").map((control) => control.movementInCents ?? 0));
  const legacyWalletToBroker = sum(orderedControls.filter((control) => control.kind === "deposit" && control.originDestination === "Saldo billetera").map((control) => (control.movementInCents ?? 0) + (control.transferFeeInCents ?? 0)));
  const legacyBrokerToWallet = sum(orderedControls.filter((control) => control.kind === "withdrawal" && control.originDestination === "Saldo billetera").map((control) => (control.movementInCents ?? 0) - (control.transferFeeInCents ?? 0)));
  const externalWallet = sum(input.walletMovements.filter((movement) => movement.kind === "external_contribution").map((movement) => movement.amountInCents));
  const priorPendingCollection = sum(input.walletMovements.filter((movement) => movement.kind === "prior_pending_collection").map((movement) => movement.amountInCents));
  const personalWalletWithdrawal = sum(input.walletMovements.filter((movement) => movement.kind === "personal_withdrawal").map((movement) => movement.amountInCents));
  const brokerToWallet = sum(input.walletMovements.filter((movement) => movement.kind === "broker_to_wallet").map((movement) => movement.amountInCents - (movement.feeInCents ?? 0)));
  const walletToBroker = sum(input.walletMovements.filter((movement) => movement.kind === "wallet_to_broker").map((movement) => movement.amountInCents));
  const walletToWalletFees = sum(input.walletMovements.filter((movement) => movement.kind === "wallet_to_wallet").map((movement) => movement.feeInCents ?? 0));
  const transferFees = sum(input.walletMovements.map((movement) => movement.feeInCents ?? 0))
    + sum(input.fundingWithdrawals.filter((withdrawal) => withdrawal.collectedOn).map((withdrawal) => withdrawal.feeInCents ?? 0))
    + sum(orderedControls.map((control) => control.transferFeeInCents ?? 0));
  const capitalNetInCents = opening.capitalNetInCents + sum(purchasesForPeriod.filter((account) => account.fundsOrigin === "Aporte trader").map((account) => account.priceInCents)) + brokerContribution + externalWallet - brokerPersonalWithdrawal - personalWalletWithdrawal;
  const walletBalanceInCents = opening.walletBalanceInCents + collectedNet + priorPendingCollection - generatedPurchases - legacyWalletToBroker + legacyBrokerToWallet - walletToBroker + brokerToWallet + externalWallet - personalWalletWithdrawal - walletToWalletFees;
  const periodResultInCents = brokerOperatingResult - totalPurchases + approved - transferFees;
  const accumulatedResultInCents = opening.accumulatedResultInCents + periodResultInCents;
  const fundingPendingInCents = Math.max(0, opening.fundingPendingInCents + approved - collected - priorPendingCollection);
  const positionObservableInCents = (brokerBalanceInCents ?? 0) + walletBalanceInCents + fundingPendingInCents;
  const positionExpectedInCents = capitalNetInCents + accumulatedResultInCents;
  const commission = calculateDeskCommission(realizedGainInCents);
  // Compatibility for old callers only. The shared loader supplies signed,
  // independently persisted opening balances, never a balancing difference.
  const openingLiveResultInCents = opening.liveResultInCents
    ?? -(opening.gainReconciliationBaselineInCents ?? opening.floatingInCents ?? 0);
  const openingVirginPriceInCents = opening.virginPriceInCents ?? 0;
  const reconstructedPeriodResultInCents = realizedGainInCents
    + liveResultInCents - openingLiveResultInCents
    - virginPriceInCents + openingVirginPriceInCents
    + uncoveredBrokerResultInCents - transferFees;
  return {
    resultDetails: {
      verified: opening.verified !== false,
      openingLiveResultInCents,
      openingVirginPriceInCents,
      openingAccumulatedResultInCents: opening.accumulatedResultInCents,
      liveResultInCents,
      brokerResultInCents: brokerOperatingResult,
      purchasesInCents: totalPurchases,
      approvedPayoutsInCents: approved,
      feesInCents: transferFees,
      reconstructedPeriodResultInCents,
      accumulatedClosedResultInCents: (opening.accumulatedClosedResultInCents ?? 0) + realizedGainInCents,
      accumulatedUncoveredResultInCents: (opening.accumulatedUncoveredResultInCents ?? 0) + uncoveredBrokerResultInCents,
      accumulatedFeesInCents: (opening.accumulatedFeesInCents ?? 0) + transferFees,
      accumulatedAdjustmentsInCents: opening.accumulatedAdjustmentsInCents ?? 0,
      accumulatedBreakdownAvailable: opening.accumulatedBreakdownAvailable
        ?? (opening.accumulatedResultInCents === 0 && openingLiveResultInCents === 0 && openingVirginPriceInCents === 0),
    },
    accountStates: states,
    uncoveredBrokerResultInCents,
    accumulatedResultInCents,
    brokerBalanceInCents,
    capitalNetInCents,
    commissionInCents: commission.amountInCents,
    commissionRateLabel: commission.rateLabel,
    floatingInCents,
    fundingCollectedInCents: collected,
    fundingPendingInCents,
    fundingWithdrawals: input.fundingWithdrawals,
    manualAccountStateCount,
    periodResultInCents,
    positionDifferenceInCents: positionObservableInCents - positionExpectedInCents,
    positionExpectedInCents,
    positionObservableInCents,
    realizedGainInCents,
    realizedReconciliationDifferenceInCents: reconstructedPeriodResultInCents - periodResultInCents,
    traderGainInCents: Math.max(realizedGainInCents, 0) - commission.amountInCents,
    virginPriceInCents,
    walletBalanceInCents,
    walletMovements: input.walletMovements,
  };
}
