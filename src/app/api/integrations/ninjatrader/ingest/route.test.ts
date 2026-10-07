import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ensureNinjaBrokerBalanceBaseline, requireNinjaConnector, persistNinjaSnapshot, processNinjaTransitions, routeNinjaInventory } = vi.hoisted(() => ({
  ensureNinjaBrokerBalanceBaseline: vi.fn(),
  requireNinjaConnector: vi.fn(),
  persistNinjaSnapshot: vi.fn(),
  processNinjaTransitions: vi.fn(),
  routeNinjaInventory: vi.fn(),
}));

vi.mock("@/modules/ninja/server/connector-auth", () => ({
  requireNinjaConnector,
}));
vi.mock("@/modules/ninja/server/snapshot-persistence", () => ({ persistNinjaSnapshot }));
vi.mock("@/modules/ninja/server/transition-processing", () => ({ processNinjaTransitions }));
vi.mock("@/modules/ninja/server/broker-balance-processing", () => ({ ensureNinjaBrokerBalanceBaseline }));
vi.mock("@/modules/ninja/server/intake-routing", () => ({ routeNinjaInventory }));

import { POST } from "./route";

const payload = {
  accounts: [
    {
      accountName: "LFE05088021070001",
      cashValue: 50_000,
      connectionName: "Ninja Mauri",
      connectionStatus: "Connected",
      netLiquidation: 50_000,
      providerName: "Provider31",
      realizedProfitLoss: 0,
      totalCashBalance: 0,
      unrealizedProfitLoss: 0,
    },
  ],
  eventId: "event-1",
  kind: "inventory_snapshot",
  observedAt: "2026-08-26T14:14:25.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireNinjaConnector.mockResolvedValue({ connectorId: "connector-1", ownerUserId: "user-1" });
  persistNinjaSnapshot.mockResolvedValue({ persisted: true });
  processNinjaTransitions.mockResolvedValue({ detectedChanges: 1, processed: true });
  ensureNinjaBrokerBalanceBaseline.mockResolvedValue({ created: false, processed: true });
  routeNinjaInventory.mockResolvedValue([{ destinationConnectorId: "connector-1", snapshot: payload }]);
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/integrations/ninjatrader/ingest", () => {
  it("accepts an inventory from the paired connector", async () => {
    const request = new Request("http://localhost/api/integrations/ninjatrader/ingest", {
      body: JSON.stringify(payload),
      headers: {
        authorization: "Bearer access-token",
        "content-type": "application/json",
      },
      method: "POST",
    });

    const result = await POST(request);

    expect(result.status).toBe(202);
    expect(requireNinjaConnector).toHaveBeenCalledWith(request);
    expect(persistNinjaSnapshot).toHaveBeenCalledWith("connector-1", payload, "connector-1");
    expect(processNinjaTransitions).toHaveBeenCalledWith("connector-1", payload);
    await expect(result.json()).resolves.toMatchObject({
      accepted: true,
      persisted: true,
      summary: { accountCount: 1 },
      destinations: 1,
    });
  });

  it("rejects a request without a valid connector session", async () => {
    requireNinjaConnector.mockResolvedValue(new Response(null, { status: 401 }));
    const request = new Request("http://localhost/api/integrations/ninjatrader/ingest", {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect((await POST(request)).status).toBe(401);
  });

  it("does not acknowledge inventory that was not saved", async () => {
    persistNinjaSnapshot.mockResolvedValue({ persisted: false, reason: "storage_error" });
    const result = await POST(new Request("http://localhost/api/integrations/ninjatrader/ingest", {
      method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json" },
    }));
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ accepted: false, persisted: false });
    expect(processNinjaTransitions).not.toHaveBeenCalled();
  });

  it("does not echo internal processing results or identifying labels", async () => {
    processNinjaTransitions.mockResolvedValue({ processed: true, privateDetail: "do-not-return" });
    const result = await POST(new Request("https://app.test/ingest", {
      method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json" },
    }));
    expect(await result.json()).toEqual({ accepted: true, persisted: true, destinations: 1,
      summary: { accountCount: 1, connectionCount: 1 } });
    expect(console.info).toHaveBeenCalledWith("NinjaTrader inventory received", { accountCount: 1, connectionCount: 1 });
  });

  it("strips arbitrary extra data before routing", async () => {
    await POST(new Request("https://app.test/ingest", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, ownerUserId: "other", accounts: [{ ...payload.accounts[0], secret: "private" }] }),
    }));
    expect(routeNinjaInventory).toHaveBeenCalledWith("connector-1", payload);
  });

  it("rejects invalid dates without attempting routing or storage", async () => {
    const result = await POST(new Request("https://app.test/ingest", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, observedAt: "invalid" }),
    }));
    expect(result.status).toBe(422);
    expect(routeNinjaInventory).not.toHaveBeenCalled();
    expect(persistNinjaSnapshot).not.toHaveBeenCalled();
  });

  it("returns a retryable generic error on infrastructure exceptions", async () => {
    routeNinjaInventory.mockRejectedValueOnce(new Error("private connection and secret"));
    const result = await POST(new Request("https://app.test/ingest", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    }));
    expect(result.status).toBe(503);
    expect(result.headers.get("Retry-After")).toBe("15");
    expect(await result.text()).not.toContain("private connection");
    expect(console.error).toHaveBeenCalledWith("NODAL_NINJA_INTAKE_UNAVAILABLE", { scope: "inventory" });
  });
});
