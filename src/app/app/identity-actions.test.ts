import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const query = {
      eq: () => query,
      maybeSingle: mocks.maybeSingle,
      select: () => query,
    };
    return {
      auth: { getUser: mocks.getUser },
      from: () => query,
      rpc: mocks.rpc,
    };
  },
}));

import { createIdentityDirectly } from "./identity-actions";

describe("identity access gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "4da1b67b-daf7-4e6d-99af-bfe94a93d981" } } });
  });

  it("rejects identity mutations when an administrator has not enabled the tab", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { identities_enabled: false }, error: null });

    const result = await createIdentityDirectly({
      email: "identidad@example.com",
      fullName: "Identidad Prueba",
      workspaceId: "869f0cd0-e9a2-4ddf-9532-43b3c6c48a55",
    });

    expect(result).toEqual({
      message: "Identidades todavía no fue habilitada por un administrador.",
      ok: false,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("allows an enabled user to reach the audited identity RPC", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { identities_enabled: true }, error: null });
    mocks.rpc.mockResolvedValue({ error: null });

    const result = await createIdentityDirectly({
      email: "identidad@example.com",
      fullName: "Identidad Prueba",
      workspaceId: "869f0cd0-e9a2-4ddf-9532-43b3c6c48a55",
    });

    expect(result.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("create_nodal_identity_direct", expect.objectContaining({
      target_email: "identidad@example.com",
    }));
  });
});
