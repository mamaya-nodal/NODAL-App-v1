import { describe, expect, it, vi } from "vitest";
import { NETWORKS } from "../domain/stablecoins";
import { readStablecoinWallet } from "./alchemy";

const wallet = `0x${"a".repeat(40)}`;
const other = `0x${"b".repeat(40)}`;
const hash = `0x${"c".repeat(64)}`;
const recent = "2026-10-03T12:00:00Z";
const token = NETWORKS[0].tokens[0];
const entry = { hash, uniqueId: `${hash}:log:3`, category: "erc20", from: other, to: wallet,
  metadata: { blockTimestamp: recent }, rawContract: { address: token.address, decimal: "0x6", value: "0x1e8480" } };

describe("Alchemy wallet evidence", () => {
  it("reads allowed balances and deduplicates both transfer sides", async () => {
    const request = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      if (body.method === "alchemy_getTokenBalances") return Response.json({ result: { tokenBalances: String(url).startsWith("https://eth-mainnet") ? [
        { contractAddress: token.address, tokenBalance: "0xf4240" },
        { contractAddress: other, tokenBalance: "0x1000000" },
      ] : [] } });
      return Response.json({ result: { transfers: String(url).startsWith("https://eth-mainnet") ? [entry] : [] } });
    });
    const result = await readStablecoinWallet(wallet, "2026-10-01T00:00:00Z", "2026-10-04T00:00:00Z", "fake", request as typeof fetch);
    expect(result.balance_cents).toBe(100);
    expect(result.transfers).toMatchObject([{ amount_cents: 200, direction: "in", log_index: 3 }]);
    expect(request).toHaveBeenCalledTimes(NETWORKS.length * 3);
  });

  it("keeps previous reading if any network rejects or returns partial data", async () => {
    const request = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      if (String(url).startsWith("https://base-mainnet")) return new Response("error", { status: 429 });
      return Response.json({ result: body.method === "alchemy_getTokenBalances" ? { tokenBalances: [] } : { transfers: [] } });
    });
    await expect(readStablecoinWallet(wallet, "2026-10-01T00:00:00Z", "2026-10-04T00:00:00Z", "fake", request as typeof fetch)).rejects.toThrow();
  });

  it("rejects repeated cursors and unknown token precision", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      if (body.method === "alchemy_getTokenBalances") return Response.json({ result: { tokenBalances: [] } });
      return Response.json({ result: { transfers: [], pageKey: "repeat" } });
    });
    await expect(readStablecoinWallet(wallet, "2026-10-01T00:00:00Z", "2026-10-04T00:00:00Z", "fake", request as typeof fetch)).rejects.toThrow("Paginación repetida");
    const invalid = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      if (body.method === "alchemy_getTokenBalances") return Response.json({ result: { tokenBalances: [] } });
      return Response.json({ result: { transfers: [{ ...entry, rawContract: { ...entry.rawContract, decimal: "0x12" } }] } });
    });
    await expect(readStablecoinWallet(wallet, "2026-10-01T00:00:00Z", "2026-10-04T00:00:00Z", "fake", invalid as typeof fetch)).rejects.toThrow("Precisión");
  });
});
