import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, rpc } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}));

import { POST } from "./route";

const connectorId = "11111111-1111-4111-8111-111111111111";

function request(body: unknown) {
  return new Request("http://localhost/api/ninja-account-registration-exclusions/restore", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user-id" } }, error: null });
  rpc.mockResolvedValue({ data: 0, error: null });
});

describe("POST /api/ninja-account-registration-exclusions/restore", () => {
  it("rehabilita las cuentas que el conector volvió a informar", async () => {
    rpc.mockResolvedValue({ data: 1, error: null });

    const result = await POST(request({ connectorId }));

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      message: "La cuenta eliminada quedó habilitada para volver a registrarse. Si todavía no aparece, conectala en NinjaTrader y actualizá nuevamente.",
      ok: true,
      restoredCount: 1,
    });
    expect(rpc).toHaveBeenCalledWith(
      "restore_current_user_ninja_account_registration_exclusions",
      { target_connector_id: connectorId },
    );
  });

  it("actualiza normalmente cuando no hay exclusiones recuperables", async () => {
    const result = await POST(request({ connectorId }));

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      message: "Listado actualizado con la última información de NinjaTrader.",
      ok: true,
      restoredCount: 0,
    });
  });

  it("no acepta conectores ajenos o inactivos", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "ninja_connector_not_available" } });

    const result = await POST(request({ connectorId }));

    expect(result.status).toBe(409);
    expect((await result.json()).ok).toBe(false);
  });
});
