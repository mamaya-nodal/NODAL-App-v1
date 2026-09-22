import { classifyNinjaAccount } from "./account-classification";
import type { NinjaAccountSnapshot } from "./ingestion-payload";

export type NinjaInventoryView = Readonly<{
  accounts: readonly NinjaAccountSnapshot[];
  observed_at: string;
}>;

export type NinjaLiveBrokerBalance = Readonly<{
  balanceInCents: number;
  observedAt: string;
  sourceAccounts: ReadonlyArray<{
    accountName: string;
    balanceInCents: number;
    connectionName: string;
    displayName?: string;
  }>;
}>;

export type NinjaBrokerAccountAlias = Readonly<{
  accountName: string;
  connectionName: string;
  displayName: string;
}>;

function cents(value: number) {
  return Math.round(value * 100);
}

export function buildNinjaLiveBrokerBalance(
  inventories: readonly NinjaInventoryView[],
): NinjaLiveBrokerBalance | null {
  const sources = inventories.flatMap((inventory) => inventory.accounts.flatMap((account) => {
    if (
      account.connectionStatus.toLowerCase() !== "connected" ||
      classifyNinjaAccount(account, inventory.observed_at).type !== "broker" ||
      account.cashValue === null ||
      !Number.isFinite(account.cashValue)
    ) return [];

    return [{
      accountName: account.accountName,
      balanceInCents: cents(account.cashValue),
      connectionName: account.connectionName,
      observedAt: inventory.observed_at,
    }];
  }));

  if (sources.length === 0) return null;
  return {
    balanceInCents: sources.reduce((total, source) => total + source.balanceInCents, 0),
    observedAt: sources.reduce(
      (latest, source) => source.observedAt > latest ? source.observedAt : latest,
      sources[0].observedAt,
    ),
    sourceAccounts: sources
      .map((source) => ({
        accountName: source.accountName,
        balanceInCents: source.balanceInCents,
        connectionName: source.connectionName,
      }))
      .sort((left, right) => `${left.connectionName}\u0000${left.accountName}`.localeCompare(`${right.connectionName}\u0000${right.accountName}`)),
  };
}

export function applyNinjaBrokerAccountAliases(
  balance: NinjaLiveBrokerBalance | null,
  aliases: readonly NinjaBrokerAccountAlias[],
): NinjaLiveBrokerBalance | null {
  if (!balance) return null;
  const aliasesByAccount = new Map(
    aliases.map((alias) => [
      `${alias.connectionName}\u0000${alias.accountName}`,
      alias.displayName,
    ]),
  );
  return {
    ...balance,
    sourceAccounts: balance.sourceAccounts.map((account) => ({
      ...account,
      displayName: aliasesByAccount.get(
        `${account.connectionName}\u0000${account.accountName}`,
      ),
    })),
  };
}
