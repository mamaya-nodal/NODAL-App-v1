import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ activateMimical: vi.fn() }));
vi.mock("@/modules/addons/server/mimical-auth", () => ({
  activateMimical: mocks.activateMimical,
  MimicalServiceUnavailable: class MimicalServiceUnavailable extends Error {},
}));

import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/integrations/mimical/activate", () => {
  it("exchanges the one-use code for an installation credential", async () => {
    mocks.activateMimical.mockResolvedValue({ installationId: "install", installationToken: "secret", ownerLabel: "Julian" });
    const response = await POST(new Request("https://app.test/api/integrations/mimical/activate", {
      body: JSON.stringify({ code: "ABCD2345", installationKey: "11111111-1111-4111-8111-111111111111", mimicalVersion: "1.1.0" }),
      headers: { "content-type": "application/json" }, method: "POST",
    }));
    expect(response.status).toBe(201);
    expect(mocks.activateMimical).toHaveBeenCalledOnce();
  });

  it("rejects an expired or consumed code", async () => {
    mocks.activateMimical.mockResolvedValue(null);
    const response = await POST(new Request("https://app.test/api/integrations/mimical/activate", {
      body: JSON.stringify({ code: "ABCD2345", installationKey: "11111111-1111-4111-8111-111111111111", mimicalVersion: "1.1.0" }),
      headers: { "content-type": "application/json" }, method: "POST",
    }));
    expect(response.status).toBe(401);
  });
});
