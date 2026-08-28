import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateNinjaConnector, persistNinjaSnapshot, processNinjaTransitions, processNinjaBrokerBalance } = vi.hoisted(() => ({
  authenticateNinjaConnector: vi.fn(),
  persistNinjaSnapshot: vi.fn(),
  processNinjaTransitions: vi.fn(),
  processNinjaBrokerBalance: vi.fn(),
}));

vi.mock("@/modules/ninja/server/connector-auth", () => ({
  authenticateNinjaConnector,
  bearerToken(request: Request) {
    return request.headers.get("authorization")?.replace(/^Bearer\s+/, "") ?? null;
  },
}));
vi.mock("@/modules/ninja/server/snapshot-persistence", () => ({ persistNinjaSnapshot }));
vi.mock("@/modules/ninja/server/transition-processing", () => ({ processNinjaTransitions }));
vi.mock("@/modules/ninja/server/broker-balance-processing", () => ({ processNinjaBrokerBalance }));

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
  authenticateNinjaConnector.mockResolvedValue({ connectorId: "connector-1", ownerUserId: "user-1" });
  persistNinjaSnapshot.mockResolvedValue({ persisted: true });
  processNinjaTransitions.mockResolvedValue({ detectedChanges: 1, processed: true });
  processNinjaBrokerBalance.mockResolvedValue({ created: true, processed: true });
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
    expect(authenticateNinjaConnector).toHaveBeenCalledWith("access-token");
    expect(persistNinjaSnapshot).toHaveBeenCalledWith("connector-1", payload);
    expect(processNinjaTransitions).toHaveBeenCalledWith("connector-1", payload);
    expect(processNinjaBrokerBalance).toHaveBeenCalledWith("connector-1", payload);
    await expect(result.json()).resolves.toMatchObject({
      accepted: true,
      persisted: true,
      summary: { accountCount: 1 },
      transitions: { detectedChanges: 1, processed: true },
      brokerBalance: { created: true, processed: true },
    });
  });

  it("rejects a request without a valid connector session", async () => {
    authenticateNinjaConnector.mockResolvedValue(null);
    const request = new Request("http://localhost/api/integrations/ninjatrader/ingest", {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect((await POST(request)).status).toBe(401);
  });
});
