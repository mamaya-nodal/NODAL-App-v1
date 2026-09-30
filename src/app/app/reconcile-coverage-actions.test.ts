import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, lookup, eq, persist, revalidate } = vi.hoisted(() => ({
  getUser: vi.fn(), lookup: vi.fn(), eq: vi.fn(), persist: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => {
  const query = { select: () => query, eq: (...args: unknown[]) => { eq(...args); return query; }, maybeSingle: lookup };
  return { auth: { getUser }, from: () => query };
} }));
vi.mock("@/modules/ninja/server/automatic-operation-processing", () => ({ persistAutomaticOperationBatches: persist }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => {
  const query = { select: () => query, eq: (...args: unknown[]) => { eq(...args); return query; }, maybeSingle: lookup };
  return { from: () => query };
} }));
import { retryCoverageReconciliation } from "./reconcile-coverage-actions";

const id = "96abfd9b-4623-4440-a3b7-f409d256a8e2";
function owned(status = "blocked") {
  lookup.mockResolvedValueOnce({ data: { access_state: "active" } })
    .mockResolvedValueOnce({ data: { connector_id: "connector", broker_session_id: 156341, accounting_status: status } })
    .mockResolvedValueOnce({ data: { id: "connector" } });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
  getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
});
afterEach(() => vi.unstubAllEnvs());
describe("coverage recovery authorization", () => {
  it("rejects invalid input and unauthenticated callers", async () => {
    expect((await retryCoverageReconciliation("bad")).ok).toBe(false);
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await retryCoverageReconciliation(id)).ok).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });
  it("rejects inactive users", async () => {
    lookup.mockResolvedValueOnce({ data: { access_state: "pending" } });
    expect((await retryCoverageReconciliation(id)).ok).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });
  it("rejects another owner's connector", async () => {
    lookup.mockResolvedValueOnce({ data: { access_state: "active" } })
      .mockResolvedValueOnce({ data: { connector_id: "other", broker_session_id: 1 } })
      .mockResolvedValueOnce({ data: null });
    expect((await retryCoverageReconciliation(id)).ok).toBe(false);
    expect(eq).toHaveBeenCalledWith("owner_user_id", "owner");
    expect(persist).not.toHaveBeenCalled();
  });
  it("does not process an already committed operation again", async () => {
    owned("committed");
    expect((await retryCoverageReconciliation(id)).ok).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });
  it("reprocesses only the selected session and verifies the persisted result", async () => {
    owned();
    lookup.mockResolvedValueOnce({ data: { accounting_status: "committed" } });
    expect((await retryCoverageReconciliation(id)).ok).toBe(true);
    expect(persist).toHaveBeenCalledWith("connector", 156341);
    expect(revalidate).toHaveBeenCalledWith("/app");
  });
  it("does not claim success when blocked or when verification fails", async () => {
    owned();
    lookup.mockResolvedValueOnce({ data: { accounting_status: "blocked", accounting_blocking_reason: "Revisar cuenta" } });
    expect(await retryCoverageReconciliation(id)).toEqual({ ok: false, message: "Revisar cuenta" });
    owned();
    lookup.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    expect((await retryCoverageReconciliation(id)).ok).toBe(false);
  });
});
