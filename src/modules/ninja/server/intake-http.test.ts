import { describe, expect, it, vi } from "vitest";
import { readNinjaJson } from "./intake-http";

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://app.test/intake", {
    method: "POST", body, headers: { "content-type": "application/json", ...headers },
  });
}

async function status(req: Request, limit = 64) {
  const result = await readNinjaJson(req, limit);
  if (result.ok) throw new Error("Expected rejection");
  expect(result.response.headers.get("Cache-Control")).toContain("no-store");
  return result.response.status;
}

describe("bounded Ninja HTTP intake", () => {
  it("accepts existing JSON requests and charset parameters", async () => {
    expect(await readNinjaJson(request('{"ok":true}', { "content-type": "Application/JSON; charset=utf-8" }), 64))
      .toEqual({ ok: true, payload: { ok: true } });
  });

  it.each(["text/plain", "text/application/json", "application/json-evil"])("rejects misleading MIME %s", async (type) => {
    expect(await status(request("{}", { "content-type": type }))).toBe(415);
  });

  it.each(["-1", "NaN", "1.5", "9007199254740992"])("rejects malformed size %s", async (length) => {
    expect(await status(request("{}", { "content-length": length }))).toBe(400);
  });

  it("rejects an oversized declared body before reading it", async () => {
    const req = request("{}", { "content-length": "65" });
    expect(await status(req)).toBe(413);
    expect(req.bodyUsed).toBe(false);
  });

  it("counts UTF-8 bytes, not characters, with missing or understated length", async () => {
    const cases: Record<string, string>[] = [{}, { "content-length": "1" }];
    for (const headers of cases) {
      expect(await status(request(JSON.stringify("á".repeat(32)), headers))).toBe(413);
    }
  });

  it("accepts exactly the limit", async () => {
    expect(await readNinjaJson(request('"1234"'), 6)).toEqual({ ok: true, payload: "1234" });
  });

  it("cancels a streaming body as soon as it exceeds the budget", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(65)); }, cancel,
    });
    const req = new Request("https://app.test/intake", {
      method: "POST", body: stream, duplex: "half", headers: { "content-type": "application/json" },
    } as RequestInit);
    expect(await status(req)).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not leak malformed JSON in errors", async () => {
    const result = await readNinjaJson(request('{"secret":"private"'), 64);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(await result.response.text()).not.toContain("private");
  });

  it("rejects invalid UTF-8 rather than silently replacing account names", async () => {
    const req = new Request("https://app.test/intake", {
      method: "POST", body: new Uint8Array([34, 255, 34]), headers: { "content-type": "application/json" },
    });
    expect(await status(req)).toBe(400);
  });
});
