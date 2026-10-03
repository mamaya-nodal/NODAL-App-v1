import { NETWORKS, approvedToken, normalizeAddress, parseTransfer, unitsToCents, type ObservedTransfer } from "../domain/stablecoins";

export async function readStablecoinWallet(address: string, from: string, until: string, apiKey: string, request: typeof fetch = fetch) {
  const wallet = normalizeAddress(address);
  const deadline = AbortSignal.timeout(20_000);
  async function pages(path: string, params: Record<string, string>) {
    const rows: Record<string, unknown>[] = [];
    let cursor = "";
    const seen = new Set<string>();
    for (let page = 0; page < 30; page++) {
      const url = new URL(`https://deep-index.moralis.io/api/v2.2/${path}`);
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await request(url, { headers: { "X-API-Key": apiKey }, cache: "no-store", signal: AbortSignal.any([deadline, AbortSignal.timeout(15_000)]) });
      if (!response.ok) throw new Error("El proveedor no pudo completar la consulta.");
      const body = await response.json();
      if (!Array.isArray(body.result)) throw new Error("Respuesta incompleta del proveedor.");
      rows.push(...body.result);
      if (!body.cursor) return rows;
      cursor = String(body.cursor);
      if (seen.has(cursor)) throw new Error("Paginación repetida.");
      seen.add(cursor);
    }
    throw new Error("Historial demasiado extenso; consulta incompleta.");
  }
  // No partial total: every covered network must succeed before publishing.
  const networks = await Promise.all(NETWORKS.map(async (network) => {
    const balances = await pages(`wallets/${wallet}/tokens`, { chain: network.id });
    let units = BigInt(0);
    const breakdown: { chain: string; symbol: string; raw_amount: string }[] = [];
    const seen = new Set<string>();
    for (const balance of balances) {
      const token = approvedToken(network.id, String(balance.token_address));
      if (!token) continue;
      if (seen.has(token.address)) throw new Error("Saldo duplicado del proveedor.");
      seen.add(token.address);
      if (Number(balance.decimals) !== 6 || typeof balance.balance !== "string") throw new Error("Precisión inválida.");
      unitsToCents(balance.balance);
      units += BigInt(balance.balance);
      breakdown.push({ chain: network.id, symbol: token.symbol, raw_amount: balance.balance });
    }
    const transfers: ObservedTransfer[] = [];
    if (from < until) {
      const rows = await pages(`${wallet}/erc20/transfers`, { chain: network.id, from_date: from, to_date: until, order: "ASC", limit: "100" });
      for (const row of rows) {
        const transfer = parseTransfer(network.id, wallet, row);
        if (transfer && transfer.occurred_at >= from && transfer.occurred_at <= until) transfers.push(transfer);
      }
    }
    return { units, breakdown, transfers };
  }));
  return { balance_cents: unitsToCents(networks.reduce((sum, network) => sum + network.units, BigInt(0)).toString()),
    breakdown: networks.flatMap((network) => network.breakdown),
    transfers: networks.flatMap((network) => network.transfers) };
}
