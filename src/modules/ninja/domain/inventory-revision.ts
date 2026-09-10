import type { NinjaInventoryView } from "./live-broker-balance";

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function buildNinjaInventoryRevision(inventories: readonly NinjaInventoryView[]) {
  const identities = inventories
    .flatMap((inventory) => inventory.accounts.map((account) => [
      account.connectionName.trim(),
      account.accountName.trim(),
      account.connectionStatus.trim().toLowerCase(),
    ].join("\u0000")))
    .sort();

  return `${identities.length}:${hash(identities.join("\u0001"))}`;
}
