import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, lookup } = vi.hoisted(() => ({ rpc: vi.fn(), lookup: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: lookup }) }) }),
}) }));

import { authenticateNinjaConnector, ConnectorServiceUnavailable, hashConnectorSecret, normalizePairingCode, refreshNinjaConnector, requireNinjaConnector } from "./connector-auth";
import { POST as refreshRoute } from "@/app/api/integrations/ninjatrader/refresh/route";

describe("Ninja connector credentials", () => {
  it("normalizes the code shown to the user", () => {
    expect(normalizePairingCode(" ab3d-7k9q ")).toBe("AB3D7K9Q");
  });

  it("stores only a deterministic SHA-256 digest", () => {
    expect(hashConnectorSecret("secret")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashConnectorSecret("secret")).not.toContain("secret");
  });
});

describe("connector session recovery", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
    rpc.mockReset();
    lookup.mockReset().mockResolvedValue({ data: { refresh_expires_at: "2026-12-01T00:00:00Z" }, error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("does not rotate the recovery secret when a refresh response is lost", async () => {
    rpc.mockResolvedValue({ data: [{ connector_id: "same-id", owner_user_id: "owner" }], error: null });
    const first = await refreshNinjaConnector("persisted-secret");
    const retry = await refreshNinjaConnector("persisted-secret");
    expect(first?.refreshToken).toBe("persisted-secret");
    expect(retry?.refreshToken).toBe("persisted-secret");
    expect(retry?.accessToken).not.toBe(first?.accessToken);
    expect(retry?.refreshExpiresAt).toBe("2026-12-01T00:00:00Z");
    for (const [, args] of rpc.mock.calls) {
      expect(args.target_new_refresh_token_hash).toBe(args.target_refresh_token_hash);
      expect(args.target_refresh_expires_at).toBe("2026-12-01T00:00:00Z");
    }
  });

  it.each(["57014", "PGRST301", "42501", "P0001"])("does not report storage error %s as revocation", async (code) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "storage failure" } });
    const result = await refreshRoute(new Request("https://app.test/refresh", { method: "POST", headers: { authorization: "Bearer test-secret" } }));
    expect(result.status).toBe(503);
    expect(result.headers.get("Retry-After")).toBe("15");
    expect(JSON.stringify(await result.json())).not.toContain("test-secret");
  });

  it("returns 401 only for a confirmed rejected refresh", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "Connector refresh is invalid or expired" } });
    const result = await refreshRoute(new Request("https://app.test/refresh", { method: "POST", headers: { authorization: "Bearer invalid" } }));
    expect(result.status).toBe(401);
  });

  it("keeps a network failure distinct from invalid credentials", async () => {
    rpc.mockRejectedValue(new TypeError("fetch failed"));
    const result = await refreshRoute(new Request("https://app.test/refresh", { method: "POST", headers: { authorization: "Bearer persisted" } }));
    expect(result.status).toBe(503);
  });

  it("does not turn an authentication database failure into a false 401", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "57014" } });
    await expect(authenticateNinjaConnector("persisted")).rejects.toBeInstanceOf(ConnectorServiceUnavailable);
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await authenticateNinjaConnector("invalid")).toBeNull();
  });

  it("preserves credentials if the expiration lookup fails", async () => {
    lookup.mockResolvedValue({ data: null, error: { code: "57014" } });
    await expect(refreshNinjaConnector("persisted")).rejects.toBeInstanceOf(ConnectorServiceUnavailable);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns retryable 503 from the shared authentication guard", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "57014" } });
    const response = await requireNinjaConnector(new Request("https://app.test/ingest", { headers: { authorization: "Bearer valid" } }));
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(503);
  });
});
