export type NinjaConnectionReview = Readonly<{
  connection_name: string;
  status: "approved" | "isolated";
}>;

export function isolatedNinjaConnectionNames(
  reviews: ReadonlyArray<NinjaConnectionReview>,
) {
  return new Set(
    reviews
      .filter((review) => review.status === "isolated")
      .map((review) => review.connection_name),
  );
}

export function isNinjaConnectionActive(
  connectionName: string,
  isolatedConnections: ReadonlySet<string>,
) {
  return !isolatedConnections.has(connectionName);
}

export function observedNinjaConnectionNames(
  accounts: ReadonlyArray<{ connectionName: string }>,
) {
  return [...new Set(
    accounts
      .map((account) => account.connectionName.trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}
