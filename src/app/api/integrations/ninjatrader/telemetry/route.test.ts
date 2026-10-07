import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireNinjaConnector: vi.fn(), routeNinjaTelemetry: vi.fn(),
  persistNinjaTradeTelemetry: vi.fn(), refreshNinjaTechnicalOperations: vi.fn(),
  getUser: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/modules/ninja/server/connector-auth", () => ({ requireNinjaConnector: mocks.requireNinjaConnector }));
vi.mock("@/modules/ninja/server/intake-routing", () => ({ routeNinjaTelemetry: mocks.routeNinjaTelemetry }));
vi.mock("@/modules/ninja/server/telemetry-persistence", () => ({ persistNinjaTradeTelemetry: mocks.persistNinjaTradeTelemetry }));
vi.mock("@/modules/ninja/server/technical-operation-processing", () => ({ refreshNinjaTechnicalOperations: mocks.refreshNinjaTechnicalOperations }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
import { GET, POST } from "./route";

const event = {
  kind: "execution", eventId: "execution-1", occurredAt: "2026-10-07T14:00:00.000Z",
  accountName: "LFE123", connectionName: "private-connection", providerName: "provider",
  executionId: "exec-1", orderId: "order-1", orderAction: "Buy", instrument: "NQ 12-26",
  price: 24100.125, quantity: 1, marketPosition: "Long",
};
const payload = { kind: "trade_telemetry_batch", batchId: "batch-1", observedAt: event.occurredAt, events: [event] };
const request = (body: unknown = payload) => new Request("https://app.test/telemetry", {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.requireNinjaConnector.mockResolvedValue({ connectorId: "paired", ownerUserId: "owner" });
  mocks.routeNinjaTelemetry.mockResolvedValue([{ batch: payload, destinationConnectorId: "authorized-destination" }]);
  mocks.persistNinjaTradeTelemetry.mockResolvedValue({ persisted: true, acceptedEvents: 1 });
});
afterEach(() => vi.restoreAllMocks());

describe("Ninja telemetry transport and permissions", () => {
  it("uses authenticated routing, preserves precision and the legacy response", async () => {
    const result = await POST(request({ ...payload, connectorId: "attacker", ownerUserId: "other",
      events: [{ ...event, destinationConnectorId: "other", secret: "do-not-store" }],
    }));
    expect(result.status).toBe(202);
    expect(mocks.routeNinjaTelemetry).toHaveBeenCalledWith("paired", payload);
    expect(mocks.persistNinjaTradeTelemetry).toHaveBeenCalledWith("authorized-destination", payload);
    expect(await result.json()).toEqual({ accepted: true, acceptedEvents: 1, batchId: "batch-1", destinations: 1 });
    expect(result.headers.get("Cache-Control")).toContain("no-store");
  });

  it.each([401, 503])("does not read or route unauthenticated/unverifiable requests (%s)", async (status) => {
    mocks.requireNinjaConnector.mockResolvedValue(new Response(null, { status }));
    const req = request();
    expect((await POST(req)).status).toBe(status);
    expect(req.bodyUsed).toBe(false);
    expect(mocks.routeNinjaTelemetry).not.toHaveBeenCalled();
    expect(mocks.persistNinjaTradeTelemetry).not.toHaveBeenCalled();
  });

  it("does not accept a batch when any routed destination fails to persist", async () => {
    mocks.routeNinjaTelemetry.mockResolvedValue([
      { batch: payload, destinationConnectorId: "one" }, { batch: payload, destinationConnectorId: "two" },
    ]);
    mocks.persistNinjaTradeTelemetry.mockResolvedValueOnce({ persisted: true, acceptedEvents: 1 })
      .mockResolvedValueOnce({ persisted: false, acceptedEvents: 0, reason: "storage_error" });
    const result = await POST(request());
    expect(result.status).toBe(503);
    expect(result.headers.get("Retry-After")).toBe("15");
    expect(await result.json()).toMatchObject({ accepted: false });
    expect(mocks.refreshNinjaTechnicalOperations).toHaveBeenCalledTimes(1);
  });

  it("returns retryable failure when routing is unavailable", async () => {
    mocks.routeNinjaTelemetry.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(503);
    expect(mocks.persistNinjaTradeTelemetry).not.toHaveBeenCalled();
  });

  it.each(["routeNinjaTelemetry", "persistNinjaTradeTelemetry", "refreshNinjaTechnicalOperations"] as const)
  ("contains unexpected %s errors without exposing payloads", async (name) => {
    mocks[name].mockRejectedValue(new Error("private-connection secret-token"));
    const result = await POST(request());
    expect(result.status).toBe(503);
    expect(await result.text()).not.toMatch(/private-connection|secret-token/);
    expect(console.error).toHaveBeenCalledWith("NODAL_NINJA_INTAKE_UNAVAILABLE", { scope: "telemetry" });
  });

  it("rejects invalid timestamps before routing", async () => {
    expect((await POST(request({ ...payload, events: [{ ...event, occurredAt: "invalid" }] }))).status).toBe(422);
    expect(mocks.routeNinjaTelemetry).not.toHaveBeenCalled();
  });

  it("does not query telemetry without a web session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET()).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reads only current-user RPCs, never a client-supplied user ID", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect((await GET()).status).toBe(200);
    expect(mocks.rpc.mock.calls).toEqual([
      ["get_current_user_ninja_trade_telemetry", { target_limit: 200 }],
      ["get_current_user_ninja_operation_probe_sessions", { target_limit: 20 }],
      ["get_current_user_ninja_reconciliation_details", { target_limit: 500 }],
    ]);
  });
});
