import { classifyNinjaAccount } from "./account-classification";
import type { NinjaInventorySnapshot } from "./ingestion-payload";
import { resolveNinjaReferenceBalance } from "./reference-balance";

export type NinjaBrokerBalanceCandidate = Readonly<{
  balanceInCents: number;
  sourceAccounts: ReadonlyArray<{
    accountName: string;
    balanceInCents: number;
    connectionName: string;
  }>;
}>;

export function extractNinjaBrokerBalance(
  snapshot: NinjaInventorySnapshot,
  approvedConnections: ReadonlySet<string>,
): NinjaBrokerBalanceCandidate | null {
  const brokerAccounts = snapshot.accounts.filter((account) => {
    if (
      !approvedConnections.has(account.connectionName) ||
      account.connectionStatus.toLowerCase() !== "connected"
    ) return false;

    return classifyNinjaAccount(account, snapshot.observedAt).type === "broker";
  });

  if (brokerAccounts.length === 0) return null;

  const sourceAccounts: Array<{
    accountName: string;
    balanceInCents: number;
    connectionName: string;
  }> = [];
  for (const account of brokerAccounts) {
    const balance = resolveNinjaReferenceBalance(account);
    if (balance.status !== "verified") return null;
    sourceAccounts.push({
      accountName: account.accountName,
      balanceInCents: balance.balanceInCents,
      connectionName: account.connectionName,
    });
  }

  return {
    balanceInCents: sourceAccounts.reduce(
      (total, account) => total + account.balanceInCents,
      0,
    ),
    sourceAccounts: [...sourceAccounts].sort((left, right) =>
      `${left.connectionName}\u0000${left.accountName}`.localeCompare(
        `${right.connectionName}\u0000${right.accountName}`,
      ),
    ),
  };
}
