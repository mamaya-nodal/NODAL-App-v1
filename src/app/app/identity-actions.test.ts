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

import { claimIdentityBrokerAccount, createIdentityDirectly, retireIdentity } from "./identity-actions";

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

  it("returns visible confirmation after assigning a broker account", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { identities_enabled: true }, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    const result = await claimIdentityBrokerAccount({
      accountName: "2149906",
      connectionName: "Live",
      physicalConnectorId: "69b6c516-c0d8-4691-862b-2b15af76bd10",
    });

    expect(result).toEqual({
      message: "Cuenta broker 2149906 asignada correctamente.",
      ok: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("claim_ninja_broker_account", {
      target_account_name: "2149906",
      target_connection_name: "Live",
      target_physical_connector_id: "69b6c516-c0d8-4691-862b-2b15af76bd10",
    });
  });
});
