import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));

import { POST } from "./route";

const installationId = "22222222-2222-4222-8222-222222222222";
const token = "a".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("identity MIMICAL mail dispatch", () => {
  it("returns only the server-validated recipient data to the mail bridge", async () => {
    mocks.rpc.mockResolvedValue({ data: [{
      expires_at: "2026-10-29T15:00:00.000Z",
      identity_name: "Jordan Barrera",
      recipient_email: "jordan@example.com",
      referent_name: "David",
    }], error: null });
    const response = await POST(new Request("https://app.test/dispatch", {
      body: JSON.stringify({ action: "lookup", installationId, token }),
      method: "POST",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      identityName: "Jordan Barrera",
      recipientEmail: "jordan@example.com",
      referentName: "David",
    }));
  });
});
