export type WalletBalancePresentationInput = Readonly<{
  accountingInCents: number;
  automatic: boolean;
  observedInCents: number | null;
}>;

export type WalletBalancePresentation = Readonly<{
  accountingInCents: number;
  availableInCents: number;
  differenceInCents: number;
  verified: boolean;
}>;

export function presentWalletBalances(
  wallets: ReadonlyArray<WalletBalancePresentationInput>,
): WalletBalancePresentation {
  const accountingInCents = wallets.reduce(
    (total, wallet) => total + wallet.accountingInCents,
    0,
  );
  const availableInCents = wallets.reduce(
    (total, wallet) => total + (
      wallet.automatic && wallet.observedInCents !== null
        ? wallet.observedInCents
        : wallet.accountingInCents
    ),
    0,
  );

  return {
    accountingInCents,
    availableInCents,
    differenceInCents: availableInCents - accountingInCents,
    verified: wallets.every((wallet) => !wallet.automatic || wallet.observedInCents !== null),
  };
}
