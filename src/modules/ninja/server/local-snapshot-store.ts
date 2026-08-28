import type { NinjaInventorySnapshot } from "../domain/ingestion-payload";

type LocalNinjaState = {
  connectorId: string | null;
  firstSeenAt: Map<string, string>;
  latestSnapshot: NinjaInventorySnapshot | null;
};
const stateKey = Symbol.for("nodal.local-ninja-state");
const globalState = globalThis as typeof globalThis & { [stateKey]?: LocalNinjaState };
function state(): LocalNinjaState {
  globalState[stateKey] ??= { connectorId: null, firstSeenAt: new Map(), latestSnapshot: null };
  return globalState[stateKey];
}
function accountKey(connectorId: string, connection: string, account: string) {
  return `${connectorId}\u0000${connection}\u0000${account}`;
}

export function rememberLocalNinjaSnapshot(connectorId: string, snapshot: NinjaInventorySnapshot) {
  const current = state();
  for (const account of snapshot.accounts) {
    const key = accountKey(connectorId, account.connectionName, account.accountName);
    if (!current.firstSeenAt.has(key)) current.firstSeenAt.set(key, snapshot.observedAt);
  }
  current.connectorId = connectorId;
  current.latestSnapshot = snapshot;
}

export function readLocalNinjaSnapshot() {
  const current = state();
  return current.latestSnapshot ? { firstSeenAt: new Map(current.firstSeenAt), snapshot: current.latestSnapshot } : null;
}

export function localFirstSeenKey(connectorId: string, connection: string, account: string) {
  return accountKey(connectorId, connection, account);
}
