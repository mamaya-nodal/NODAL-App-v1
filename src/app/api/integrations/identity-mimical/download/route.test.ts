import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mimicalDownloadResponse: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/modules/addons/server/mimical-download", () => ({ mimicalDownloadResponse: mocks.mimicalDownloadResponse }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.mimicalDownloadResponse.mockResolvedValue(new Response("zip", { status: 200 }));
});

describe("identity MIMICAL email download", () => {
  it("serves the ZIP only after consuming its temporary identity link", async () => {
    const installationId = "22222222-2222-4222-8222-222222222222";
    const token = "a".repeat(64);
    const response = await GET(new Request(`https://app.test/download?installationId=${installationId}&token=${token}`));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("consume_identity_mimical_download", {
      target_installation_id: installationId,
      target_token: token,
    });
    expect(mocks.mimicalDownloadResponse).toHaveBeenCalledWith("identity");
  });
});
