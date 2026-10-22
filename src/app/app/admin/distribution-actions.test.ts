import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/admin/server/admin-access", () => ({ requireNodalAdmin: mocks.auth }));
import { saveMasterDistribution } from "./distribution-actions";
const userId = "00000000-0000-4000-8000-000000000099";
const adminUserId = "00000000-0000-4000-8000-000000000098";
const valid = { adminPoolBps: 2500, adminShares: [{ adminUserId, shareBps: 2500 }], effectiveMonth: "2026-10-01", nodalBps: 2500, reason: "Acuerdo comercial", userBps: 5000, userId };
describe("Master distributions", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ rpc: mocks.rpc }); mocks.rpc.mockResolvedValue({ error: null }); });
  it("saves an exact final split through the audited RPC", async () => {
    expect((await saveMasterDistribution(valid)).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("admin_save_user_distribution", expect.objectContaining({ target_user_bps: 5000, target_nodal_bps: 2500, target_admin_pool_bps: 2500 }));
  });
  it("rejects a total different from 100% before authorization", async () => {
    expect((await saveMasterDistribution({ ...valid, nodalBps: 2400 })).ok).toBe(false);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("rejects an administrative breakdown that differs from its pool", async () => {
    expect((await saveMasterDistribution({ ...valid, adminShares: [{ adminUserId, shareBps: 2000 }] })).ok).toBe(false);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("does not write when Master authorization fails", async () => {
    mocks.auth.mockRejectedValue(new Error("forbidden"));
    await expect(saveMasterDistribution(valid)).rejects.toThrow("forbidden");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
