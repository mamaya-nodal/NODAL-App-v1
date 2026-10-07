import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.requireConnector.mockResolvedValue({
      connectorId: "connector-1",
      ownerUserId: "owner-1",
    });
  });
  afterEach(() => vi.restoreAllMocks());

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
    expect(mocks.rememberVersions.mock.invocationCallOrder[0]).toBeLessThan(mocks.bootstrap.mock.invocationCallOrder[0]);
  });

  it("registra la versión aunque falle luego la reconstrucción", async () => {
    mocks.bootstrap.mockRejectedValueOnce(new Error("reconstrucción pendiente"));
    const result = await POST(new Request("https://app.test/heartbeat", {
      body: JSON.stringify({ connectorVersion: "0.10", installedSourceVersion: "0.10" }),
      method: "POST",
    }));
    expect(result.status).toBe(503);
    expect(result.headers.get("Retry-After")).toBe("15");
    expect(await result.text()).not.toContain("reconstrucción pendiente");
    expect(mocks.rememberVersions).toHaveBeenCalledWith("connector-1", "0.10", "0.10");
  });

  it("autentica antes de leer el cuerpo o procesar operaciones", async () => {
    mocks.requireConnector.mockResolvedValue(new Response(null, { status: 401 }));
    const request = new Request("https://app.test/heartbeat", { method: "POST", body: "untrusted" });
    expect((await POST(request)).status).toBe(401);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.rememberVersions).not.toHaveBeenCalled();
    expect(mocks.operations).not.toHaveBeenCalled();
  });

  it("conserva compatibilidad con latidos sin cuerpo", async () => {
    expect((await POST(new Request("https://app.test/heartbeat", { method: "POST" }))).status).toBe(202);
    expect(mocks.rememberVersions).toHaveBeenCalledWith("connector-1", undefined, undefined);
  });

  it("rechaza cuerpos excesivos antes de procesarlos", async () => {
    expect((await POST(new Request("https://app.test/heartbeat", { method: "POST", body: "x".repeat(4097) }))).status).toBe(413);
    expect(mocks.rememberVersions).not.toHaveBeenCalled();
    expect(mocks.operations).not.toHaveBeenCalled();
  });
});
