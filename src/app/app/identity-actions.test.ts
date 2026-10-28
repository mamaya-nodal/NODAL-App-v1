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

import { createIdentityDirectly, retireIdentity, sendIdentityMimicalInstallation } from "./identity-actions";

const identityId = "09c293db-6514-471c-8bd1-981f2d97f5f8";
const installationId = "6522d107-cd3e-4730-aef4-ee172cd8c4bd";

describe("identity access gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ ok: true }),
      ok: true,
    }));
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
    mocks.rpc
      .mockResolvedValueOnce({ data: identityId, error: null })
      .mockResolvedValueOnce({ data: installationId, error: null });

    const result = await createIdentityDirectly({
      email: "identidad@example.com",
      fullName: "Identidad Prueba",
      workspaceId: "869f0cd0-e9a2-4ddf-9532-43b3c6c48a55",
    });

    expect(result).toEqual({
      message: "Identidad agregada. El conector fue enviado por correo.",
      ok: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("create_nodal_identity_direct", expect.objectContaining({
      target_email: "identidad@example.com",
    }));
    expect(mocks.rpc).toHaveBeenCalledWith("create_identity_connector_installation", expect.objectContaining({
      target_identity_id: identityId,
    }));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps the created identity and reports a retry when email delivery fails", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { identities_enabled: true }, error: null });
    mocks.rpc
      .mockResolvedValueOnce({ data: identityId, error: null })
      .mockResolvedValueOnce({ data: installationId, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    vi.mocked(fetch).mockRejectedValueOnce(new Error("mail unavailable"));

    const result = await createIdentityDirectly({
      email: "identidad@example.com",
      fullName: "Identidad Prueba",
      workspaceId: "869f0cd0-e9a2-4ddf-9532-43b3c6c48a55",
    });

    expect(result).toEqual({
      message: "Identidad agregada, pero el correo no pudo enviarse. Podés reenviarlo desde su tarjeta.",
      ok: true,
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith("cancel_identity_connector_installation", {
      target_installation_id: installationId,
    });
  });

  it("retires an identity through the ownership-checked RPC", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { identities_enabled: true }, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    const result = await retireIdentity(identityId);

    expect(result.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("retire_nodal_identity", {
      target_identity_id: identityId,
    });
  });

  it("dispatches MIMICAL to the selected identity email", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { configuration_enabled: true, identities_enabled: true },
      error: null,
    });
    mocks.rpc.mockResolvedValueOnce({ data: installationId, error: null });

    const result = await sendIdentityMimicalInstallation(identityId);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("correo de la identidad");
    expect(mocks.rpc).toHaveBeenCalledWith("create_identity_mimical_installation", expect.objectContaining({
      target_identity_id: identityId,
    }));
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: expect.stringContaining('"action":"send_mimical_installation"'),
      method: "POST",
    }));
  });

});
