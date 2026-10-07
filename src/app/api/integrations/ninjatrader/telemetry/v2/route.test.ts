import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), parse: vi.fn(), receive: vi.fn(), drain: vi.fn(), after: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/modules/ninja/server/connector-auth", () => ({ requireNinjaConnector: mocks.auth }));
vi.mock("@/modules/ninja/server/telemetry-v2", () => ({ parseTelemetryV2: mocks.parse, receiveTelemetryV2: mocks.receive, safelyDrainTelemetryV2: mocks.drain }));
import { POST } from "./route";
const request = () => new Request("https://invalid.test/v2", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("NINJA_TELEMETRY_V2_ENABLED", "true");
  mocks.auth.mockResolvedValue({ connectorId: "physical" });
  mocks.parse.mockReturnValue({ batchId: "batch", events: ["event"] });
  mocks.receive.mockResolvedValue([{ eventId: "one", status: "pending", sha256: "hash", reason: "unresolved" }]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("v2 deployment gate and acknowledgements", () => {
  it("defaults to disabled without touching storage", async () => {
    vi.stubEnv("NINJA_TELEMETRY_V2_ENABLED", "");
    const req = request(); expect((await POST(req)).status).toBe(503); expect(req.bodyUsed).toBe(false);
    expect(mocks.receive).not.toHaveBeenCalled();
  });
  it("authenticates before reading input", async () => {
    mocks.auth.mockResolvedValue(new Response(null, { status: 401 }));
    const req = request(); expect((await POST(req)).status).toBe(401); expect(req.bodyUsed).toBe(false);
  });
  it("returns explicit pending receipts only after durable storage", async () => {
    const res = await POST(request()); expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ protocol: 2, batchId: "batch", receipts: [{ eventId: "one", status: "pending", sha256: "hash", reason: "unresolved" }] });
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.receive).toHaveBeenCalledWith("physical", ["event"]);
    await mocks.after.mock.calls[0][0](); expect(mocks.drain).toHaveBeenCalledWith("physical");
  });
  it("never acknowledges failed persistence", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.receive.mockRejectedValue(new Error("private-data"));
    const res = await POST(request()); expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("private-data"); expect(mocks.after).not.toHaveBeenCalled();
  });
  it("rejects invalid protocol before storage", async () => {
    mocks.parse.mockReturnValue(null);
    expect((await POST(request())).status).toBe(422); expect(mocks.receive).not.toHaveBeenCalled();
  });
});
