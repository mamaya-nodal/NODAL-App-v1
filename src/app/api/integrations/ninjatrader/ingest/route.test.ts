import { beforeEach, describe, expect, it, vi } from "vitest";

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
  requireNinjaConnector.mockResolvedValue({ connectorId: "connector-1", ownerUserId: "user-1" });
  persistNinjaSnapshot.mockResolvedValue({ persisted: true });
  processNinjaTransitions.mockResolvedValue({ detectedChanges: 1, processed: true });
  ensureNinjaBrokerBalanceBaseline.mockResolvedValue({ created: false, processed: true });
  routeNinjaInventory.mockResolvedValue([{ destinationConnectorId: "connector-1", snapshot: payload }]);
});

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
});
