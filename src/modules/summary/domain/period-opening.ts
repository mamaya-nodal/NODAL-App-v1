import type {
  OperationalOpeningSnapshot,
  SummaryControl,
  WalletMovement,
} from "./operational-summary";

type HistoricalPurchase = Readonly<{
  fundsOrigin: "Aporte trader" | "Saldo generado";
  periodId: string;
  priceInCents: number;
}>;

type HistoricalControl = SummaryControl & Readonly<{
  periodId: string;
}>;

type HistoricalWalletMovement = WalletMovement & Readonly<{
  periodId: string;
}>;

type HistoricalFundingWithdrawal = Readonly<{
  amountInCents: number;
  collectedOn: string | null;
  feeInCents?: number;
  periodId: string;
}>;

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

export function buildPeriodOpening(input: Readonly<{
  controls: readonly HistoricalControl[];
  currentPeriodId: string;
  fundingWithdrawals: readonly HistoricalFundingWithdrawal[];
  periodIdsInOrder: readonly string[];
  purchases: readonly HistoricalPurchase[];
  walletMovements: readonly HistoricalWalletMovement[];
}>): OperationalOpeningSnapshot {
  const currentIndex = input.periodIdsInOrder.indexOf(input.currentPeriodId);
  const priorIds = new Set(currentIndex <= 0 ? [] : input.periodIdsInOrder.slice(0, currentIndex));
  const controls = input.controls.filter((control) => priorIds.has(control.periodId));
  const purchases = input.purchases.filter((purchase) => priorIds.has(purchase.periodId));
  const wallet = input.walletMovements.filter((movement) => priorIds.has(movement.periodId));
  const funding = input.fundingWithdrawals.filter((withdrawal) => priorIds.has(withdrawal.periodId));
  const latestPriorPeriodId = currentIndex > 0 ? input.periodIdsInOrder[currentIndex - 1] : null;
  const latestPriorControls = controls.filter((control) => control.periodId === latestPriorPeriodId);

  const approved = sum(funding.map((withdrawal) => withdrawal.amountInCents));
  const collected = sum(funding.filter((withdrawal) => withdrawal.collectedOn).map((withdrawal) => withdrawal.amountInCents));
  const collectedNet = sum(funding.filter((withdrawal) => withdrawal.collectedOn).map((withdrawal) => withdrawal.amountInCents - (withdrawal.feeInCents ?? 0)));
  const priorPendingCollections = sum(wallet.filter((movement) => movement.kind === "prior_pending_collection").map((movement) => movement.amountInCents));
  const externalWallet = sum(wallet.filter((movement) => movement.kind === "external_contribution").map((movement) => movement.amountInCents));
  const personalWallet = sum(wallet.filter((movement) => movement.kind === "personal_withdrawal").map((movement) => movement.amountInCents));
  const brokerWalletIn = sum(wallet.filter((movement) => movement.kind === "broker_to_wallet").map((movement) => movement.amountInCents - (movement.feeInCents ?? 0)));
  const brokerWalletOut = sum(wallet.filter((movement) => movement.kind === "wallet_to_broker").map((movement) => movement.amountInCents));
  const walletToWalletFees = sum(wallet.filter((movement) => movement.kind === "wallet_to_wallet").map((movement) => movement.feeInCents ?? 0));
  const generatedPurchases = sum(purchases.filter((purchase) => purchase.fundsOrigin === "Saldo generado").map((purchase) => purchase.priceInCents));
  const contributedPurchases = sum(purchases.filter((purchase) => purchase.fundsOrigin === "Aporte trader").map((purchase) => purchase.priceInCents));
  const brokerContribution = sum(controls.filter((control) => control.kind === "deposit" && control.originDestination === "Aporte trader").map((control) => control.movementInCents ?? 0));
  const brokerPersonalWithdrawal = sum(controls.filter((control) => control.kind === "withdrawal" && control.originDestination === "Retiro personal").map((control) => control.movementInCents ?? 0));
  const walletToBroker = sum(controls.filter((control) => control.kind === "deposit" && control.originDestination === "Saldo billetera").map((control) => (control.movementInCents ?? 0) + (control.transferFeeInCents ?? 0)));
  const brokerToWallet = sum(controls.filter((control) => control.kind === "withdrawal" && control.originDestination === "Saldo billetera").map((control) => (control.movementInCents ?? 0) - (control.transferFeeInCents ?? 0)));
  const brokerOperatingResult = sum(controls.map((control) => control.operatingResultInCents ?? 0));
  const totalPurchases = sum(purchases.map((purchase) => purchase.priceInCents));
  const transferFees = sum(wallet.map((movement) => movement.feeInCents ?? 0))
    + sum(funding.filter((withdrawal) => withdrawal.collectedOn).map((withdrawal) => withdrawal.feeInCents ?? 0))
    + sum(controls.map((control) => control.transferFeeInCents ?? 0));

  return {
    accumulatedResultInCents: brokerOperatingResult - totalPurchases + approved - transferFees,
    brokerBalanceInCents: latestPriorControls.at(-1)?.balanceAfterInCents ?? null,
    capitalNetInCents: contributedPurchases + brokerContribution + externalWallet - brokerPersonalWithdrawal - personalWallet,
    fundingPendingInCents: Math.max(0, approved - collected - priorPendingCollections),
    walletBalanceInCents: collectedNet + priorPendingCollections - generatedPurchases - walletToBroker + brokerToWallet + brokerWalletIn - brokerWalletOut + externalWallet - personalWallet - walletToWalletFees,
  };
}
