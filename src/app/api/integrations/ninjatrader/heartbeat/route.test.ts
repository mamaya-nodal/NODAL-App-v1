import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  rememberVersions: vi.fn(),
  requireConnector: vi.fn(),
  transitions: vi.fn(),
  operations: vi.fn(),
}));

vi.mock("@/modules/ninja/server/connector-auth", () => ({
  rememberNinjaConnectorVersions: mocks.rememberVersions,
  requireNinjaConnector: mocks.requireConnector,
}));
vi.mock("@/modules/ninja/server/broker-balance-processing", () => ({
  bootstrapNinjaBrokerBalance: mocks.bootstrap,
}));
vi.mock("@/modules/ninja/server/technical-operation-processing", () => ({
  refreshNinjaTechnicalOperations: mocks.operations,
}));
vi.mock("@/modules/ninja/server/transition-processing", () => ({
  refreshNinjaTransitionsFromLatestSnapshot: mocks.transitions,
}));

import { POST } from "./route";

describe("heartbeat de versiones Ninja", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireConnector.mockResolvedValue({
      connectorId: "connector-1",
      ownerUserId: "owner-1",
    });
  });

  it("conserva por separado la versión activa y el código actualizado", async () => {
    const response = await POST(new Request("https://app.test/heartbeat", {
      body: JSON.stringify({
        connectorVersion: "0.9",
        installedSourceVersion: "1.0",
      }),
      method: "POST",
    }));

    expect(response.status).toBe(202);
    expect(mocks.rememberVersions).toHaveBeenCalledWith(
      "connector-1",
      "0.9",
      "1.0",
    );
  });
});
