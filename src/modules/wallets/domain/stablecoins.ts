// Allowlist, never trust a token's symbol. Sources and coverage in docs/38_WALLETS_CRIPTO.md.
export const NETWORKS = [
  { id: "eth", name: "Ethereum", tokens: [
    { symbol: "USDT", address: "0xdac17f958d2ee523a2206206994597c13d831ec7" },
    { symbol: "USDC", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
  ] },
  { id: "base", name: "Base (USDC)", tokens: [
    { symbol: "USDC", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" },
  ] },
  { id: "arbitrum", name: "Arbitrum", tokens: [
    { symbol: "USDT0", address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9" },
    { symbol: "USDC", address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" },
  ] },
  { id: "polygon", name: "Polygon", tokens: [
    { symbol: "USDT0", address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f" },
    { symbol: "USDC", address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359" },
  ] },
] as const;

export function normalizeAddress(input: string): string {
  const address = input.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address) || /^0x0{40}$/.test(address)) throw new Error("Dirección EVM inválida.");
  return address;
}

// All allowlisted assets have six decimals. Preserve raw units, round only for display.
export function unitsToCents(raw: string): number {
  if (!/^\d+$/.test(raw)) throw new Error("Importe de token inválido.");
  const cents = (BigInt(raw) + BigInt(5000)) / BigInt(10000);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Importe fuera de rango.");
  return Number(cents);
}

export function approvedToken(chain: string, address: string) {
  return NETWORKS.find((network) => network.id === chain)?.tokens.find((token) => token.address === address.toLowerCase());
}

export type ObservedTransfer = {
  chain: string; tx_hash: string; log_index: number; token_address: string;
  symbol: string; raw_amount: string; amount_cents: number; direction: "in" | "out" | "self";
  occurred_at: string; from_address: string; to_address: string;
};

export function parseTransfer(chain: string, wallet: string, row: Record<string, unknown>): ObservedTransfer | null {
  const token = approvedToken(chain, String(row.address));
  if (!token) return null;
  const from = String(row.from_address).toLowerCase();
  const to = String(row.to_address).toLowerCase();
  if (![from, to].every((value) => /^0x[0-9a-f]{40}$/.test(value))) throw new Error("Contraparte inválida.");
  const address = normalizeAddress(wallet);
  if (from !== address && to !== address) throw new Error("Transferencia ajena a la billetera.");
  if (Number(row.token_decimals) !== 6 || typeof row.value !== "string") throw new Error("Precisión de token inválida.");
  const cents = unitsToCents(row.value);
  const log = Number(row.log_index);
  const hash = String(row.transaction_hash).toLowerCase();
  if (!Number.isSafeInteger(log) || log < 0 || !/^0x[0-9a-f]{64}$/.test(hash)) throw new Error("Identificador inválido.");
  const occurredAt = new Date(String(row.block_timestamp));
  if (!Number.isFinite(occurredAt.getTime())) throw new Error("Fecha inválida.");
  return { chain, tx_hash: hash, log_index: log, token_address: token.address, symbol: token.symbol,
    raw_amount: row.value, amount_cents: cents, direction: from === to ? "self" : to === address ? "in" : "out",
    occurred_at: occurredAt.toISOString(), from_address: from, to_address: to };
}
