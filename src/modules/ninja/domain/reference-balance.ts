import type { NinjaAccountSnapshot } from "./ingestion-payload";

export type NinjaReferenceBalance =
  | Readonly<{ balanceInCents: number; status: "verified" }>
  | Readonly<{ balanceInCents: null; status: "conflict" | "missing" }>;

function cents(value: number) {
  return Math.round(value * 100);
}
export function resolveNinjaReferenceBalance(account: NinjaAccountSnapshot): NinjaReferenceBalance {
  if (account.cashValue === null || account.netLiquidation === null) {
    return { balanceInCents: null, status: "missing" };
  }
  const cashValueInCents = cents(account.cashValue);
  const netLiquidationInCents = cents(account.netLiquidation);
  return cashValueInCents === netLiquidationInCents
    ? { balanceInCents: cashValueInCents, status: "verified" }
    : { balanceInCents: null, status: "conflict" };
}
