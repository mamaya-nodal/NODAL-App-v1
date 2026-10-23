import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectorDownloadResponse: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}));
vi.mock("@/modules/ninja/server/connector-download", () => ({
  connectorDownloadResponse: mocks.connectorDownloadResponse,
}));
vi.mock("@/modules/ninja/server/installer-authorization", () => ({
  createInstallerAuthorization: () => ({ code: "ABCD2345", codeHash: "a".repeat(64), expiresAt: "2026-10-23T15:05:00.000Z" }),
  isIdentityId: (value: unknown) => value === "22222222-2222-4222-8222-222222222222",
}));

import { GET, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } } });
  mocks.rpc
    .mockResolvedValueOnce({ data: true, error: null })
    .mockResolvedValueOnce({ data: [{ pairing_id: "pairing" }], error: null });
  mocks.connectorDownloadResponse.mockResolvedValue(new Response("exe", { status: 200 }));
});

describe("automatic Ninja installer download", () => {
  it("creates a personal authorization and returns the executable", async () => {
    const response = await POST(new Request("https://app.test/api/downloads/ninja-connector", {
      body: JSON.stringify({ identityId: null }),
      headers: { "content-type": "application/json", origin: "https://app.test" },
      method: "POST",
    }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith("create_ninja_pairing_code", {
      target_code_hash: "a".repeat(64),
      target_expires_at: "2026-10-23T15:05:00.000Z",
      target_identity_id: null,
    });
    expect(mocks.connectorDownloadResponse).toHaveBeenCalledWith("ABCD2345");
  });

  it("creates an identity-scoped authorization", async () => {
    const identityId = "22222222-2222-4222-8222-222222222222";
    const response = await POST(new Request("https://app.test/api/downloads/ninja-connector", {
      body: JSON.stringify({ identityId }),
      headers: { "content-type": "application/json", origin: "https://app.test" },
      method: "POST",
    }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith("create_ninja_pairing_code", expect.objectContaining({
      target_identity_id: identityId,
    }));
  });

  it("does not create authorizations through a prefetched GET", () => {
    expect(GET().status).toBe(405);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
