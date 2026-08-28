import { beforeEach, describe, expect, it, vi } from "vitest";

const { pairNinjaConnector } = vi.hoisted(() => ({ pairNinjaConnector: vi.fn() }));
vi.mock("@/modules/ninja/server/connector-auth", () => ({ pairNinjaConnector }));

import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/integrations/ninjatrader/pair", () => {
  it("canjea un código temporal por una sesión técnica", async () => {
    pairNinjaConnector.mockResolvedValue({
      accessExpiresAt: "2026-08-28T12:10:00.000Z",
      accessToken: "access",
      connectorId: "connector-1",
      refreshExpiresAt: "2026-11-26T12:00:00.000Z",
      refreshToken: "refresh",
    });
    const result = await POST(new Request("http://localhost/api/integrations/ninjatrader/pair", {
      body: JSON.stringify({ code: "ABCD-2345", connectorVersion: "0.2" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }));
    expect(result.status).toBe(201);
    expect(pairNinjaConnector).toHaveBeenCalledWith("ABCD-2345", "0.2");
  });

  it("rechaza códigos vencidos o ya usados", async () => {
    pairNinjaConnector.mockResolvedValue(null);
    const result = await POST(new Request("http://localhost/api/integrations/ninjatrader/pair", {
      body: JSON.stringify({ code: "ABCD-2345", connectorVersion: "0.2" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }));
    expect(result.status).toBe(401);
  });
});
