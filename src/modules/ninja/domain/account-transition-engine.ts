export type NinjaPhase = "Evaluation" | "Funded" | "Live";

export type TrackedNinjaAccount = Readonly<{
  accountSizeInCents: number;
  balanceInCents: number;
  burnFloorInCents: number;
  companyCode: string;
  externalAccountName: string;
  highestEodBalanceInCents: number;
  lastBusinessDate: string;
  phase: NinjaPhase;
  product: string | null;
  reachedEvaluationTarget: boolean;
}>;

export type NewNinjaAccount = Readonly<{
  accountSizeInCents: number;
  balanceInCents: number;
  companyCode: string;
  externalAccountName: string;
  phase: NinjaPhase;
  product: string | null;
}>;

export type NinjaAccountChange = Readonly<{
  automatic: boolean;
  fromAccountName: string | null;
  kind:
    | "burned"
    | "burn_reversed"
    | "evaluation_to_funded"
    | "funded_to_live_review"
    | "new_account"
    | "reset"
    | "reset_after_burn"
    | "review_disappearance";
  reason: string;
  toAccountName: string | null;
}>;

const INITIAL_BALANCE_IN_CENTS = 5_000_000;
const INITIAL_BURN_FLOOR_IN_CENTS = 4_800_000;
const EVALUATION_TARGET_IN_CENTS = 5_300_100;
const FUNDED_FLOOR_IN_CENTS = 5_010_000;

const APPROVED_PHASE_PRODUCT_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  TOPSTEP: ["Trading Combine→Express", "Express→"],
  TRADEFY: ["Select→Select Flex"],
  TPT: ["→PRO"],
};

function sameProgram(left: Pick<TrackedNinjaAccount, "accountSizeInCents" | "companyCode" | "product">, right: Pick<NewNinjaAccount, "accountSizeInCents" | "companyCode" | "product">) {
  if (left.companyCode !== right.companyCode || left.accountSizeInCents !== right.accountSizeInCents) return false;
  if (left.product === right.product) return true;
  const transition = `${left.product ?? ""}→${right.product ?? ""}`;
  return APPROVED_PHASE_PRODUCT_TRANSITIONS[left.companyCode]?.includes(transition) ?? false;
}
function byExternalName<T extends { externalAccountName: string }>(left: T, right: T) {
  return left.externalAccountName.localeCompare(right.externalAccountName);
}

function fundedTriggerInCents(companyCode: string) {
  return companyCode === "TOPSTEP" ? 5_200_000 : 5_210_000;
}

export function startTrackingNinjaAccount(account: NewNinjaAccount, businessDate: string): TrackedNinjaAccount {
  if (account.accountSizeInCents !== INITIAL_BALANCE_IN_CENTS) {
    throw new Error("NODAL todavía no tiene una regla de riesgo aprobada para ese tamaño de cuenta.");
  }
  return {
    ...account,
    burnFloorInCents: INITIAL_BURN_FLOOR_IN_CENTS,
    highestEodBalanceInCents: account.balanceInCents,
    lastBusinessDate: businessDate,
    reachedEvaluationTarget: account.phase === "Evaluation" && account.balanceInCents >= EVALUATION_TARGET_IN_CENTS,
  };
}

export function observeTrackedNinjaAccount(
  account: TrackedNinjaAccount,
  balanceInCents: number,
  businessDate: string,
): TrackedNinjaAccount {
  let highestEodBalanceInCents = account.highestEodBalanceInCents;
  let burnFloorInCents = account.burnFloorInCents;

  if (businessDate !== account.lastBusinessDate && account.phase === "Evaluation") {
    highestEodBalanceInCents = Math.max(highestEodBalanceInCents, account.balanceInCents);
    burnFloorInCents = Math.max(INITIAL_BURN_FLOOR_IN_CENTS, highestEodBalanceInCents - 200_000);
  }

  if (account.phase === "Funded" && balanceInCents >= fundedTriggerInCents(account.companyCode)) {
    burnFloorInCents = FUNDED_FLOOR_IN_CENTS;
  }

  return {
    ...account,
    balanceInCents,
    burnFloorInCents,
    highestEodBalanceInCents,
    lastBusinessDate: businessDate,
    reachedEvaluationTarget: account.reachedEvaluationTarget
      || (account.phase === "Evaluation" && balanceInCents >= EVALUATION_TARGET_IN_CENTS),
  };
}

export function detectNinjaAccountChanges(
  disappearedAccounts: readonly TrackedNinjaAccount[],
  appearedAccounts: readonly NewNinjaAccount[],
): readonly NinjaAccountChange[] {
  const disappeared = [...disappearedAccounts].sort(byExternalName);
  const appeared = [...appearedAccounts].sort(byExternalName);
  const usedDisappeared = new Set<string>();
  const usedAppeared = new Set<string>();
  const changes: NinjaAccountChange[] = [];

  const pair = (
    from: TrackedNinjaAccount,
    to: NewNinjaAccount,
    change: Omit<NinjaAccountChange, "fromAccountName" | "toAccountName">,
  ) => {
    usedDisappeared.add(from.externalAccountName);
    usedAppeared.add(to.externalAccountName);
    changes.push({ ...change, fromAccountName: from.externalAccountName, toAccountName: to.externalAccountName });
  };

  // El paso de evaluación a funded tiene prioridad: conserva continuidad sin
  // afirmar una correspondencia propia de la prop firm.
  for (const to of appeared.filter((account) => account.phase === "Funded")) {
    const from = disappeared.find((candidate) =>
      !usedDisappeared.has(candidate.externalAccountName)
      && candidate.phase === "Evaluation"
      && candidate.reachedEvaluationTarget
      && candidate.balanceInCents > candidate.burnFloorInCents
      && sameProgram(candidate, to));
    if (from) pair(from, to, {
      automatic: true,
      kind: "evaluation_to_funded",
      reason: "La evaluación alcanzó el objetivo y fue reemplazada por una cuenta funded compatible.",
    });
  }

  // Un nombre de evaluación que reaparece con el saldo inicial representa una
  // vida nueva. El historial anterior nunca se sobrescribe.
  for (const to of appeared.filter((account) => account.phase === "Evaluation" && account.balanceInCents === INITIAL_BALANCE_IN_CENTS)) {
    const from = disappeared.find((candidate) =>
      !usedDisappeared.has(candidate.externalAccountName)
      && candidate.phase === "Evaluation"
      && sameProgram(candidate, to));
    if (from) pair(from, to, {
      automatic: true,
      kind: from.balanceInCents <= from.burnFloorInCents ? "reset_after_burn" : "reset",
      reason: from.balanceInCents <= from.burnFloorInCents
        ? "La vida anterior alcanzó el piso y luego apareció una evaluación virgen."
        : "La evaluación reapareció con el saldo inicial y comienza una vida NODAL nueva.",
    });
  }

  // Nunca se confirma automáticamente la continuidad hacia Live.
  for (const to of appeared.filter((account) => account.phase === "Live")) {
    const from = disappeared.find((candidate) =>
      !usedDisappeared.has(candidate.externalAccountName)
      && candidate.phase === "Funded"
      && sameProgram(candidate, to));
    if (from) pair(from, to, {
      automatic: false,
      kind: "funded_to_live_review",
      reason: "NODAL encontró una posible continuidad hacia Live que el usuario debe confirmar.",
    });
  }

  for (const from of disappeared.filter((account) => !usedDisappeared.has(account.externalAccountName))) {
    changes.push({
      automatic: from.balanceInCents <= from.burnFloorInCents,
      fromAccountName: from.externalAccountName,
      kind: from.balanceInCents <= from.burnFloorInCents ? "burned" : "review_disappearance",
      reason: from.balanceInCents <= from.burnFloorInCents
        ? "La cuenta desapareció después de alcanzar su piso de quema vigente."
        : from.phase === "Evaluation" && from.reachedEvaluationTarget
          ? "La evaluación alcanzó el objetivo, pero todavía no apareció una cuenta funded compatible."
          : "La cuenta desapareció sin evidencia suficiente para determinar automáticamente la causa.",
      toAccountName: null,
    });
  }

  for (const to of appeared.filter((account) => !usedAppeared.has(account.externalAccountName))) {
    changes.push({
      automatic: false,
      fromAccountName: null,
      kind: "new_account",
      reason: to.phase === "Live"
        ? "Apareció una cuenta Live sin una cuenta funded compatible; debe informarse su origen."
        : "Apareció una cuenta sin una vida anterior compatible.",
      toAccountName: to.externalAccountName,
    });
  }

  return changes;
}
