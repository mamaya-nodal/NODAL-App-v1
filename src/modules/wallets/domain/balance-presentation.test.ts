import { describe, expect, it } from "vitest";

import { presentWalletBalances } from "./balance-presentation";

describe("presentWalletBalances", () => {
  it("uses accounting balances for manual wallets and observations for automatic wallets", () => {
    expect(presentWalletBalances([
      { accountingInCents: 5_000, automatic: false, observedInCents: null },
      { accountingInCents: 0, automatic: true, observedInCents: 1_289 },
    ])).toEqual({
      accountingInCents: 5_000,
      availableInCents: 6_289,
      differenceInCents: 1_289,
    });
  });

  it("does not add an automatic observation on top of its accounting balance", () => {
    expect(presentWalletBalances([
      { accountingInCents: 1_000, automatic: true, observedInCents: 1_289 },
    ])).toEqual({
      accountingInCents: 1_000,
      availableInCents: 1_289,
      differenceInCents: 289,
    });
  });

  it("falls back to accounting while an automatic wallet has no valid reading", () => {
    expect(presentWalletBalances([
      { accountingInCents: 750, automatic: true, observedInCents: null },
    ])).toEqual({
      accountingInCents: 750,
      availableInCents: 750,
      differenceInCents: 0,
    });
  });
});
