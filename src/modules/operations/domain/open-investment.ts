import type { AccountAccountingState } from "./account-progress";

/** Capital todavía comprometido en cuentas abiertas, expresado como magnitud positiva. */
export function resolveOpenInvestmentInCents(input: Readonly<{
  accountingState: AccountAccountingState;
  accumulatedInCents: number;
}>): number {
  if (input.accountingState === "closed") return 0;
  return Math.max(0, -input.accumulatedInCents);
}
