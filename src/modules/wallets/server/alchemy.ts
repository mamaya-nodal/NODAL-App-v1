import { NETWORKS, approvedToken, normalizeAddress, unitsToCents, type ObservedTransfer } from "../domain/stablecoins";

const NETWORK_HOSTS: Record<(typeof NETWORKS)[number]["id"], string> = {
  eth: "eth-mainnet",
  base: "base-mainnet",
  arbitrum: "arb-mainnet",
  polygon: "polygon-mainnet",
};

function hexUnits(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) throw new Error("Importe hexadecimal inválido.");
  return BigInt(value).toString();
}

function transfer(chain: string, wallet: string, row: Record<string, unknown>): ObservedTransfer | null {
  if (row.category !== "erc20") return null;
  const rawContract = row.rawContract as Record<string, unknown> | null;
  const token = approvedToken(chain, String(rawContract?.address));
  if (!token) return null;
  if (Number(rawContract?.decimal) !== 6) throw new Error("Precisión de token inesperada.");
  const raw = hexUnits(rawContract?.value);
  const from = String(row.from).toLowerCase();
  const to = String(row.to).toLowerCase();
  if (![from, to].every((item) => /^0x[0-9a-f]{40}$/.test(item))) throw new Error("Contraparte inválida.");
  if (from !== wallet && to !== wallet) throw new Error("Transferencia ajena a la dirección consultada.");
  const hash = String(row.hash).toLowerCase();
  const uniqueId = String(row.uniqueId).toLowerCase();
  const match = uniqueId.match(/^0x[0-9a-f]{64}:log:(\d+)$/);
  if (!/^0x[0-9a-f]{64}$/.test(hash) || !match || !uniqueId.startsWith(`${hash}:`)) throw new Error("Identificador de evento inválido.");
  const logIndex = Number(match[1]);
  if (!Number.isSafeInteger(logIndex)) throw new Error("Índice de evento inválido.");
  const metadata = row.metadata as Record<string, unknown> | null;
  const observedDate = new Date(String(metadata?.blockTimestamp));
  if (!Number.isFinite(observedDate.getTime())) throw new Error("Fecha de bloque inválida.");
  return { chain, tx_hash: hash, log_index: logIndex, token_address: token.address,
    symbol: token.symbol, raw_amount: raw, amount_cents: unitsToCents(raw),
    direction: from === to ? "self" : to === wallet ? "in" : "out",
    occurred_at: observedDate.toISOString(), from_address: from, to_address: to };
}

export async function readStablecoinWallet(address: string, from: string, until: string, apiKey: string, request: typeof fetch = fetch) {
  const wallet = normalizeAddress(address);
  if (!apiKey || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(until))) throw new Error("Consulta inválida.");
  const deadline = AbortSignal.timeout(20_000);
  const networks = await Promise.all(NETWORKS.map(async (network) => {
    const endpoint = `https://${NETWORK_HOSTS[network.id]}.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`;
    async function rpc(method: string, params: unknown[]) {
      const response = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store",
        signal: AbortSignal.any([deadline, AbortSignal.timeout(15_000)]) });
      if (!response.ok) throw new Error(`Alchemy HTTP ${response.status}`);
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("result" in body) || (body as { error?: unknown }).error) throw new Error("Respuesta incompleta de Alchemy.");
      return (body as { result: unknown }).result;
    }
    const result = await rpc("alchemy_getTokenBalances", [wallet, network.tokens.map((token) => token.address)]);
    const balances = (result as { tokenBalances?: unknown })?.tokenBalances;
    if (!Array.isArray(balances)) throw new Error("Saldos incompletos de Alchemy.");
    let units = BigInt(0);
    const breakdown: { chain: string; symbol: string; raw_amount: string }[] = [];
    const seenBalances = new Set<string>();
    for (const item of balances) {
      const balance = item as { contractAddress?: string; tokenBalance?: string };
      const token = approvedToken(network.id, String(balance.contractAddress));
      if (!token) continue;
      if (seenBalances.has(token.address)) throw new Error("Saldo duplicado del proveedor.");
      seenBalances.add(token.address);
      const raw = hexUnits(balance.tokenBalance);
      unitsToCents(raw);
      units += BigInt(raw);
      breakdown.push({ chain: network.id, symbol: token.symbol, raw_amount: raw });
    }
    const transfers: ObservedTransfer[] = [];
    if (from < until) for (const side of ["fromAddress", "toAddress"] as const) {
      let pageKey: string | undefined;
      const seenPages = new Set<string>();
      for (let page = 0; page < 30; page++) {
        const pageResult = await rpc("alchemy_getAssetTransfers", [{ fromBlock: "0x0", toBlock: "latest", [side]: wallet,
          category: ["erc20"], contractAddresses: network.tokens.map((token) => token.address),
          withMetadata: true, excludeZeroValue: true, order: "desc", maxCount: "0x3e8", ...(pageKey ? { pageKey } : {}) }]);
        const response = pageResult as { transfers?: unknown; pageKey?: unknown };
        if (!Array.isArray(response?.transfers)) throw new Error("Historial incompleto de Alchemy.");
        let reachedStart = false;
        let previousTimestamp = Number.POSITIVE_INFINITY;
        for (const entry of response.transfers) {
          const item = transfer(network.id, wallet, entry as Record<string, unknown>);
          if (!item) continue;
          const timestamp = Date.parse(item.occurred_at);
          if (timestamp > previousTimestamp) throw new Error("Historial fuera de orden.");
          previousTimestamp = timestamp;
          if (item.occurred_at < from) { reachedStart = true; continue; }
          if (item.occurred_at <= until) transfers.push(item);
        }
        if (reachedStart || !response.pageKey) break;
        pageKey = String(response.pageKey);
        if (seenPages.has(pageKey)) throw new Error("Paginación repetida.");
        seenPages.add(pageKey);
        if (page === 29) throw new Error("Historial demasiado extenso; consulta incompleta.");
      }
    }
    return { units, breakdown, transfers };
  }));
  const uniqueTransfers = new Map<string, ObservedTransfer>();
  for (const item of networks.flatMap((network) => network.transfers)) uniqueTransfers.set(`${item.chain}:${item.tx_hash}:${item.log_index}`, item);
  return { balance_cents: unitsToCents(networks.reduce((sum, network) => sum + network.units, BigInt(0)).toString()),
    breakdown: networks.flatMap((network) => network.breakdown), transfers: [...uniqueTransfers.values()] };
}
