import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connectorDownloadResponse: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/modules/ninja/server/connector-download", () => ({ connectorDownloadResponse: mocks.connectorDownloadResponse }));
vi.mock("@/modules/ninja/server/installer-authorization", () => ({
  createInstallerAuthorization: () => ({ code: "WXYZ6789", codeHash: "b".repeat(64), expiresAt: "2026-10-23T15:05:00.000Z" }),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.connectorDownloadResponse.mockResolvedValue(new Response("exe", { status: 200 }));
});

describe("identity email installer download", () => {
  it("consumes the email link and creates the hidden identity authorization atomically", async () => {
    const installationId = "22222222-2222-4222-8222-222222222222";
    const token = "a".repeat(64);
    const response = await GET(new Request(`https://app.test/download?installationId=${installationId}&token=${token}`));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("consume_identity_connector_download_with_pairing", {
      target_code_hash: "b".repeat(64),
      target_installation_id: installationId,
      target_pairing_expires_at: "2026-10-23T15:05:00.000Z",
      target_token: token,
    });
    expect(mocks.connectorDownloadResponse).toHaveBeenCalledWith("WXYZ6789");
  });
});
