export function resolveBrokerAccountAliasView(input: Readonly<{
  editing: boolean;
  optimisticName?: string;
  persistedName?: string;
}>) {
  const name = (input.optimisticName ?? input.persistedName ?? "").trim();
  return {
    editing: input.editing || name.length === 0,
    name,
  };
}
