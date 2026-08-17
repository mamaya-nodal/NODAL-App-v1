import {
  deriveAccountOperationalState,
  type AccountOperationalState,
  type AccountStateOrigin,
} from "./account-state";
import { ACCOUNT_PHASES } from "./account-detail";
import {
  summarizeBrokerEntries,
  type BrokerRegisterSummary,
  type OperationRegisterEntry,
} from "./operation-register";

export type AccountPhase = (typeof ACCOUNT_PHASES)[number];

export type AccountPhaseWithdrawal = Readonly<{
  accountId: string;
  phase: Exclude<AccountPhase, "Evaluacion">;
  totalWithdrawalInCents: number;
}>;

export type AccountPhaseResult = Readonly<{
  broker: BrokerRegisterSummary;
  carryInCents: number;
  initialPurchasePriceInCents: number;
  phase: AccountPhase;
  totalGainInCents: number;
  totalWithdrawalInCents: number;
}>;

export type AccountCalculatedResult = Readonly<{
  phaseResults: AccountPhaseResult[];
  state: AccountOperationalState;
}>;

function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} debe expresarse en centavos enteros no negativos.`);
  }
}

export function calculateAccountResult(
  entries: OperationRegisterEntry[],
  withdrawals: AccountPhaseWithdrawal[],
  stateOrigin: AccountStateOrigin = "automatic",
  purchasePriceInCents = 0,
): AccountCalculatedResult {
  assertCents(purchasePriceInCents, "Precio de compra");
  const withdrawalsByPhase = new Map<AccountPhase, number>();
  for (const withdrawal of withdrawals) {
    assertCents(withdrawal.totalWithdrawalInCents, "TOTAL RETIRO");
    withdrawalsByPhase.set(withdrawal.phase, withdrawal.totalWithdrawalInCents);
  }

  let previousTotalGainInCents = 0;
  const phaseResults = ACCOUNT_PHASES.map((phase, phaseIndex) => {
    const persistedBroker = summarizeBrokerEntries(
      entries.filter((entry) => entry.phase === phase),
    );
    // La compra ocupa el primer NETO BROKER - de Evaluación. Se calcula desde
    // el dato de compra, sin crear ni duplicar una entrada de Control Diario.
    const initialPurchasePriceInCents = phase === "Evaluacion" ? purchasePriceInCents : 0;
    const broker: BrokerRegisterSummary = {
      entryCount: persistedBroker.entryCount + (initialPurchasePriceInCents > 0 ? 1 : 0),
      negativeInCents: persistedBroker.negativeInCents + initialPurchasePriceInCents,
      netInCents: persistedBroker.netInCents - initialPurchasePriceInCents,
      positiveInCents: persistedBroker.positiveInCents,
    };
    const carryInCents =
      stateOrigin === "manual_live" && phaseIndex > 0 && previousTotalGainInCents > 0
        ? previousTotalGainInCents
        : 0;
    const totalWithdrawalInCents =
      phase === "Evaluacion" ? 0 : withdrawalsByPhase.get(phase) ?? 0;
    const totalGainInCents =
      broker.positiveInCents + carryInCents - broker.negativeInCents + totalWithdrawalInCents;

    previousTotalGainInCents = totalGainInCents;
    return {
      broker,
      carryInCents,
      initialPurchasePriceInCents,
      phase,
      totalGainInCents,
      totalWithdrawalInCents,
    };
  });

  return {
    phaseResults,
    state: deriveAccountOperationalState({
      hasOperationalData: entries.length > 0 || withdrawals.length > 0,
      phaseTotalGainInCents: phaseResults.map((phase) => phase.totalGainInCents),
      stateOrigin,
    }),
  };
}
