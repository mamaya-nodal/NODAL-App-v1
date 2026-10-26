import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), getUser: vi.fn(), maybeSingle: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("@/modules/ninja/server/installer-authorization", () => ({
  createInstallerAuthorization: () => ({ code: "ABCD2345", codeHash: "a".repeat(64), expiresAt: "2026-10-26T12:05:00.000Z" }),
  isIdentityId: (value: unknown) => value === "22222222-2222-4222-8222-222222222222",
}));

import { POST } from "./route";

const julianId = "0c90d147-a048-48c9-8f89-e095bbadc249";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: julianId } } });
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({ maybeSingle: mocks.maybeSingle }),
    }),
  });
  mocks.maybeSingle.mockResolvedValue({
    data: { configuration_enabled: true, identities_enabled: true },
    error: null,
  });
  mocks.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: [{ pairing_id: "pair" }], error: null });
});

describe("POST /api/addons/mimical/pairing-code", () => {
  it("creates a one-use personal code for an enabled user", async () => {
    const response = await POST(new Request("https://app.test/api/addons/mimical/pairing-code", {
      body: JSON.stringify({ identityId: null }),
      headers: { "content-type": "application/json", origin: "https://app.test" },
      method: "POST",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: "ABCD2345", expiresAt: "2026-10-26T12:05:00.000Z" });
    expect(mocks.rpc).toHaveBeenLastCalledWith("create_addon_pairing_code", expect.objectContaining({
      target_identity_id: null,
      target_product_key: "mimical",
    }));
  });

  it("rejects a user whose Configuracion capability is disabled", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { configuration_enabled: false, identities_enabled: false },
      error: null,
    });
    mocks.rpc.mockReset().mockResolvedValueOnce({ data: true, error: null });
    const response = await POST(new Request("https://app.test/api/addons/mimical/pairing-code", {
      body: "{}", headers: { "content-type": "application/json", origin: "https://app.test" }, method: "POST",
    }));
    expect(response.status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
