import { beforeEach, describe, expect, it, vi } from "vitest";

const { linkNinjaConnectorDestination, requireNinjaConnector } = vi.hoisted(() => ({
  linkNinjaConnectorDestination: vi.fn(),
  requireNinjaConnector: vi.fn(),
}));
vi.mock("@/modules/ninja/server/connector-auth", () => ({
  connectorServiceUnavailableResponse: () => Response.json({ error: "unavailable" }, { status: 503 }),
  linkNinjaConnectorDestination,
  requireNinjaConnector,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  requireNinjaConnector.mockResolvedValue({ connectorId: "physical-connector", ownerUserId: "original-owner" });
  linkNinjaConnectorDestination.mockResolvedValue(true);
});

describe("POST /api/integrations/ninjatrader/link", () => {
  it("adds a destination to the authenticated installation", async () => {
    const result = await POST(new Request("https://app.test/api/integrations/ninjatrader/link", {
      body: JSON.stringify({ code: "ABCD-2345" }),
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      method: "POST",
    }));
    expect(result.status).toBe(201);
    expect(linkNinjaConnectorDestination).toHaveBeenCalledWith("physical-connector", "ABCD-2345");
  });

  it("does not replace the installation when the code cannot be linked", async () => {
    linkNinjaConnectorDestination.mockResolvedValue(false);
    const result = await POST(new Request("https://app.test/api/integrations/ninjatrader/link", {
      body: JSON.stringify({ code: "USED-234" }),
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      method: "POST",
    }));
    expect(result.status).toBe(409);
  });

  it("rejects null payloads as invalid input rather than infrastructure failures", async () => {
    const result = await POST(new Request("https://app.test/link", {
      method: "POST", body: "null", headers: { "content-type": "application/json" },
    }));
    expect(result.status).toBe(422);
    expect(linkNinjaConnectorDestination).not.toHaveBeenCalled();
  });
});
