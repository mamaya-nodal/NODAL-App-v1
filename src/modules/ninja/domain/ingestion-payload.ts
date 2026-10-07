export type NinjaAccountSnapshot = Readonly<{
  accountName: string;
  cashValue: number | null;
  connectionName: string;
  connectionStatus: string;
  netLiquidation: number | null;
  providerName: string;
  realizedProfitLoss: number | null;
  totalCashBalance: number | null;
  unrealizedProfitLoss: number | null;
}>;

export type NinjaInventorySnapshot = Readonly<{
  accounts: readonly NinjaAccountSnapshot[];
  eventId: string;
  kind: "inventory_snapshot";
  observedAt: string;
}>;

const maximumAccounts = 500;
const maximumTextLength = 160;

function isText(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= maximumTextLength;
}

function isMoney(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isAccount(value: unknown): value is NinjaAccountSnapshot {
  if (!value || typeof value !== "object") return false;

  const account = value as Record<string, unknown>;
  return (
    isText(account.accountName) &&
    isText(account.connectionName) &&
    isText(account.connectionStatus) &&
    isText(account.providerName) &&
    isMoney(account.cashValue) &&
    isMoney(account.netLiquidation) &&
    isMoney(account.realizedProfitLoss) &&
    isMoney(account.totalCashBalance) &&
    isMoney(account.unrealizedProfitLoss)
  );
}

export function isNinjaInventorySnapshot(value: unknown): value is NinjaInventorySnapshot {
  if (!value || typeof value !== "object") return false;

  const payload = value as Record<string, unknown>;
  return (
    payload.kind === "inventory_snapshot" &&
    isText(payload.eventId) &&
    isText(payload.observedAt) && Number.isFinite(Date.parse(payload.observedAt as string)) &&
    Array.isArray(payload.accounts) &&
    payload.accounts.length <= maximumAccounts &&
    payload.accounts.every(isAccount)
  );
}

export function getNinjaSnapshotSummary(snapshot: NinjaInventorySnapshot) {
  return {
    accountCount: snapshot.accounts.length,
    connectionCount: new Set(snapshot.accounts.map((account) => account.connectionName)).size,
  };
}

/** Only contract fields may cross into storage, routing and diagnostics. */
export function normalizeNinjaInventorySnapshot(snapshot: NinjaInventorySnapshot): NinjaInventorySnapshot {
  return {
    kind: snapshot.kind, eventId: snapshot.eventId, observedAt: snapshot.observedAt,
    accounts: snapshot.accounts.map((account) => ({
      accountName: account.accountName, connectionName: account.connectionName,
      connectionStatus: account.connectionStatus, providerName: account.providerName,
      cashValue: account.cashValue, netLiquidation: account.netLiquidation,
      totalCashBalance: account.totalCashBalance, realizedProfitLoss: account.realizedProfitLoss,
      unrealizedProfitLoss: account.unrealizedProfitLoss,
    })),
  };
}
