import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc }),
}));

import { POST } from "./route";

const invitationId = "11111111-1111-4111-8111-111111111111";
const token = "a".repeat(64);

beforeEach(() => vi.clearAllMocks());

describe("POST /api/integrations/user-invitation/dispatch", () => {
  it("resuelve el destinatario solo mediante id y token", async () => {
    rpc.mockResolvedValue({
      data: [{ recipient_email: "persona@example.com", referrer_name: "Alfred" }],
      error: null,
    });
    const response = await POST(new Request("http://localhost/api/integrations/user-invitation/dispatch", {
      body: JSON.stringify({ action: "lookup", invitationId, token }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      appUrl: "https://app.nodaltrading.com",
      recipientEmail: "persona@example.com",
      referrerName: "Alfred",
    });
    expect(rpc).toHaveBeenCalledWith("get_nodal_user_invitation_dispatch", {
      target_invitation_id: invitationId,
      target_token: token,
    });
  });

  it("confirma el envio mediante el mismo token", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const response = await POST(new Request("http://localhost/api/integrations/user-invitation/dispatch", {
      body: JSON.stringify({ action: "sent", invitationId, token }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("mark_nodal_user_invitation_dispatched", {
      target_invitation_id: invitationId,
      target_token: token,
    });
  });

  it("rechaza solicitudes sin credenciales validas", async () => {
    const response = await POST(new Request("http://localhost/api/integrations/user-invitation/dispatch", {
      body: JSON.stringify({ action: "lookup", invitationId, token: "invalido" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }));

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
