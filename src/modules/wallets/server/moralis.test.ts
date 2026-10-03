import { describe, expect, it, vi } from "vitest";
import { readStablecoinWallet } from "./moralis";
import { NETWORKS } from "../domain/stablecoins";
const wallet = `0x${"a".repeat(40)}`;
describe("Moralis completeness", () => {
  it("sums only approved balances, not BTC/ETH or spoofed stablecoins", async () => {
    const request = vi.fn(async (url: URL | RequestInfo) => {
      const path = new URL(String(url));
      return Response.json({ result: path.pathname.endsWith("tokens") && path.searchParams.get("chain") === "eth" ? [
        { token_address: NETWORKS[0].tokens[0].address, decimals: 6, balance: "1000000" },
        { token_address: wallet, decimals: 6, balance: "900000000", symbol: "USDT" },
      ] : [], cursor: null });
    });
    expect(await readStablecoinWallet(wallet, "2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z", "test", request as typeof fetch)).toMatchObject({ balance_cents: 100, transfers: [] });
    expect(request).toHaveBeenCalledTimes(NETWORKS.length * 2);
  });
  it("does not publish partial zero when one network fails", async () => {
    const request = vi.fn(async () => new Response("unavailable", { status: 429 }));
    await expect(readStablecoinWallet(wallet, "a", "b", "test", request as typeof fetch)).rejects.toThrow();
  });
  it("rejects repeated pagination cursors", async () => {
    const request = vi.fn(async () => Response.json({ result: [], cursor: "repeat" }));
    await expect(readStablecoinWallet(wallet, "a", "b", "test", request as typeof fetch)).rejects.toThrow("Paginación repetida");
  });
});
