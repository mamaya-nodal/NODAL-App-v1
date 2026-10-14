import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, rpc } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}));

import { POST } from "./route";

const periodId = "11111111-1111-4111-8111-111111111111";

function request(body: unknown) {
  return new Request("http://localhost/api/opening-revision-requests", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user-id" } }, error: null });
  rpc.mockResolvedValue({ data: "request-id", error: null });
});

describe("POST /api/opening-revision-requests", () => {
  it("crea la solicitud con la sesión del titular", async () => {
    const response = await POST(request({ periodId }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "Solicitud enviada. Admin Master debe autorizarla antes de editar.",
      ok: true,
    });
    expect(rpc).toHaveBeenCalledWith("request_nodal_period_opening_revision", {
      target_period_id: periodId,
    });
  });

  it("devuelve un mensaje recuperable si la sesión venció", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") });

    const response = await POST(request({ periodId }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: "La sesión venció. Volvé a ingresar.",
      ok: false,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("informa cuando ya existe actividad sin romper la aplicación", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "OPENING_REVISION_HAS_ACTIVITY" },
    });

    const response = await POST(request({ periodId }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: "Este período ya tiene actividad. La corrección debe resolverse con trazabilidad contable.",
      ok: false,
    });
  });
});
