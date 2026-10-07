import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ route: vi.fn(), rpc: vi.fn() }));
vi.mock("./intake-routing", () => ({ routeNinjaTelemetry: mocks.route }));
vi.mock("./technical-operation-processing", () => ({ refreshNinjaTechnicalOperations: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
import { parseTelemetryV2, receiveTelemetryV2 } from "./telemetry-v2";
const event = { kind: "execution", eventId: "one", occurredAt: "2026-10-07T10:00:00Z", accountName: "LFE123",
  connectionName: "connection", providerName: "provider", instrument: "NQ", executionId: "exec", orderId: "order",
  orderAction: "Buy", marketPosition: "Long", price: 24100.125, quantity: 1 };
const envelope = (value: unknown) => { const payload = JSON.stringify(value); return { payload, sha256: createHash("sha256").update(payload).digest("hex") }; };
const body = (value: unknown = event) => ({ protocol: 2, batchId: "a".repeat(32), events: [envelope(value)] });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://invalid.test"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test");
  mocks.route.mockResolvedValue([{ destinationConnectorId: "destination", batch: { events: [event] } }]);
  mocks.rpc.mockResolvedValue({ data: [{ event_id: "one", payload_hash: envelope(event).sha256, status: "persisted", reason: "stored" }], error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("event receipt protocol", () => {
  it("preserves precision and strips client ownership fields", () => {
    const result = parseTelemetryV2(body({ ...event, ownerUserId: "other", destinationConnectorId: "other" }));
    expect(result?.events[0].payload).toEqual(event);
  });
  it("rejects tampering, malformed JSON, duplicate IDs and excessive batches", () => {
    const input = body(); input.events[0].payload += " ";
    expect(parseTelemetryV2(input)).toBeNull();
    expect(parseTelemetryV2({ ...body(), events: [...body().events, ...body().events] })).toBeNull();
    expect(parseTelemetryV2({ ...body(), events: Array(51).fill(envelope(event)) })).toBeNull();
    expect(parseTelemetryV2(body({ ...event, occurredAt: "invalid" }))).toBeNull();
    expect(parseTelemetryV2(body({ ...event, extra: "x".repeat(8192) }))).toBeNull();
    expect(parseTelemetryV2({ ...body(), protocol: 1 })).toBeNull();
  });
  it("routes by the authenticated connector and validates every stored receipt", async () => {
    const parsed = parseTelemetryV2(body())!;
    expect(await receiveTelemetryV2("physical", parsed.events)).toEqual([{ eventId: "one", sha256: envelope(event).sha256, status: "persisted", reason: "stored" }]);
    expect(mocks.rpc).toHaveBeenCalledWith("receive_ninja_telemetry_v2", { target_physical: "physical", target_events: [{ ...parsed.events[0], destinationConnectorId: "destination", excluded: null }] });
  });
  it.each([null, [], [{ event_id: "other", payload_hash: envelope(event).sha256, status: "persisted", reason: "stored" }],
    [{ event_id: "one", payload_hash: "wrong", status: "persisted", reason: "stored" }],
    [{ event_id: "one", payload_hash: envelope(event).sha256, status: "unknown", reason: "stored" }]])("rejects invalid receipt response %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(receiveTelemetryV2("physical", parseTelemetryV2(body())!.events)).rejects.toThrow();
  });
  it("keeps unresolved events pending instead of silently accepting them", async () => {
    mocks.route.mockResolvedValue([]);
    mocks.rpc.mockResolvedValue({ data: [{ event_id: "one", payload_hash: envelope(event).sha256, status: "pending", reason: "unresolved" }], error: null });
    expect((await receiveTelemetryV2("physical", parseTelemetryV2(body())!.events))[0].status).toBe("pending");
    expect(mocks.rpc.mock.calls[0][1].target_events[0].destinationConnectorId).toBeNull();
  });
  it("fails closed on routing/storage failure", async () => {
    mocks.route.mockResolvedValue(null);
    await expect(receiveTelemetryV2("physical", parseTelemetryV2(body())!.events)).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
