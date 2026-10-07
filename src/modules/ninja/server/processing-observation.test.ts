import { afterEach, describe, expect, it, vi } from "vitest";
import { observedNinjaFetch, runObservedNinjaProcessing } from "./processing-observation";

afterEach(() => vi.unstubAllGlobals());
describe("durable processing observation", () => {
  it("does not mark a swallowed HTTP failure complete", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    expect(await runObservedNinjaProcessing(async () => { await observedNinjaFetch("https://invalid.test"); return 0; })).toBe(false);
  });
  it("retains network failures and thrown processing exceptions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await runObservedNinjaProcessing(async () => { try { await observedNinjaFetch("https://invalid.test"); } catch {} })).toBe(false);
    expect(await runObservedNinjaProcessing(async () => { throw new Error("failed"); })).toBe(false);
  });
  it("isolates simultaneous attempts", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => new Response(null, { status: String(url).endsWith("/ok") ? 200 : 500 })));
    expect(await Promise.all([
      runObservedNinjaProcessing(() => observedNinjaFetch("https://invalid.test/fail")),
      runObservedNinjaProcessing(() => observedNinjaFetch("https://invalid.test/ok")),
    ])).toEqual([false, true]);
  });
});
