export type SimplifiedOpeningBaseline = Readonly<{
  accounts: readonly never[];
  floatingInCents: 0;
}>;

export function simplifiedOpeningBaseline(): SimplifiedOpeningBaseline {
  return {
    accounts: [],
    floatingInCents: 0,
  };
}
