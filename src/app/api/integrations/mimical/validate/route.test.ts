import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ validateMimical: vi.fn() }));
vi.mock("@/modules/addons/server/mimical-auth", () => ({
  validateMimical: mocks.validateMimical,
  MimicalServiceUnavailable: class MimicalServiceUnavailable extends Error {},
}));

import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/integrations/mimical/validate", () => {
  it("allows new cycles only for a valid installation", async () => {
    mocks.validateMimical.mockResolvedValue({ allowNewCycles: true, ownerLabel: "Julian" });
    const response = await POST(new Request("https://app.test/api/integrations/mimical/validate", {
      body: JSON.stringify({ installationKey: "11111111-1111-4111-8111-111111111111" }),
      headers: { authorization: "Bearer secret", "content-type": "application/json" }, method: "POST",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ allowNewCycles: true, ownerLabel: "Julian" });
    expect(mocks.validateMimical).toHaveBeenCalledWith("secret", "11111111-1111-4111-8111-111111111111");
  });

  it("denies a revoked or unknown installation", async () => {
    mocks.validateMimical.mockResolvedValue(null);
    const response = await POST(new Request("https://app.test/api/integrations/mimical/validate", {
      body: JSON.stringify({ installationKey: "11111111-1111-4111-8111-111111111111" }),
      headers: { authorization: "Bearer revoked", "content-type": "application/json" }, method: "POST",
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(expect.objectContaining({ allowNewCycles: false }));
  });
});
