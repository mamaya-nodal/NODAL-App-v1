import { ACCOUNT_PHASES } from "./account-detail";

export type AccountPhase = (typeof ACCOUNT_PHASES)[number];
export type AccountOperationalState = "Evaluation" | "Funded" | "Live";
export type AccountAccountingState = "virgin" | "live" | "closed";

export type AccountProgressEntry = Readonly<{
  dailyControlId: string;
  phase: AccountPhase;
}>;

export type ApprovedAccountPayout = Readonly<{
  phase: Exclude<AccountPhase, "Evaluacion">;
}>;

export type AccountProgress = Readonly<{
  phase: AccountPhase;
  tradeDay: number;
}>;

export function isPayoutEligibleAccount(
  accountingState: AccountAccountingState,
  operationalState: AccountOperationalState,
): boolean {
  return accountingState === "live" && operationalState === "Funded";
}

export function nextAccountPhase(phase: AccountPhase): AccountPhase {
  const index = ACCOUNT_PHASES.indexOf(phase);
  return ACCOUNT_PHASES[Math.min(index + 1, ACCOUNT_PHASES.length - 1)];
}

export function advancePhaseThroughApprovedPayouts(
  initialPhase: AccountPhase,
  payouts: readonly ApprovedAccountPayout[],
): AccountPhase {
  const approvedPhases = new Set(payouts.map((payout) => payout.phase));
  let phase = initialPhase;
  while (phase !== "Evaluacion" && approvedPhases.has(phase)) {
    const next = nextAccountPhase(phase);
    if (next === phase) break;
    phase = next;
  }
  return phase;
}

export function resolveCurrentAccountProgress(input: Readonly<{
  entries: readonly AccountProgressEntry[];
  observedClosedTradeCount?: number;
  operationalState: AccountOperationalState | null;
  payouts: readonly ApprovedAccountPayout[];
}>): AccountProgress {
  let phase: AccountPhase;
  if (input.operationalState === "Evaluation") {
    phase = "Evaluacion";
  } else {
    const latestRecordedPhase = ACCOUNT_PHASES.reduce<AccountPhase | null>((latest, candidate) =>
      input.entries.some((entry) => entry.phase === candidate) ? candidate : latest,
    null);
    phase = input.operationalState === "Funded" || input.operationalState === "Live"
      ? latestRecordedPhase && latestRecordedPhase !== "Evaluacion" ? latestRecordedPhase : "Primera vuelta"
      : latestRecordedPhase ?? "Evaluacion";
    phase = advancePhaseThroughApprovedPayouts(phase, input.payouts);
  }

  const recordedTrades = new Set(input.entries
    .filter((entry) => entry.phase === phase)
    .map((entry) => entry.dailyControlId)).size;
  // La cuenta técnica actual permite reflejar un trade recién cerrado aunque
  // su conciliación contable todavía esté en curso. Después de un payout la
  // numeración se reinicia y sólo las entradas de la nueva vuelta son seguras.
  const canUseObservedCount = phase === "Evaluacion"
    || (phase === "Primera vuelta" && input.payouts.length === 0);
  const completedTrades = canUseObservedCount
    ? Math.max(recordedTrades, input.observedClosedTradeCount ?? 0)
    : recordedTrades;
  return { phase, tradeDay: completedTrades + 1 };
}

export function accountProgressLabel(progress: AccountProgress): string {
  const phase = progress.phase === "Evaluacion" ? "Evaluación" : progress.phase;
  return `${phase} Día ${progress.tradeDay}`;
}
