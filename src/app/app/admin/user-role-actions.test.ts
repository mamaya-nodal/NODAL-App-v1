import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/admin/server/admin-access", () => ({ requireNodalAdmin: mocks.auth }));
import { deactivateMasterUser } from "./user-role-actions";
const id = "00000000-0000-4000-8000-000000000099";
describe("Master deactivation", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ rpc: mocks.rpc }); mocks.rpc.mockResolvedValue({ error: null }); });
  it("uses the audited revocation without deleting records", async () => {
    expect((await deactivateMasterUser(id)).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("admin_revoke_nodal_student", { target_user_id: id, management_reason: expect.any(String) });
  });
  it("requires master authorization", async () => {
    mocks.auth.mockRejectedValue(new Error("forbidden"));
    await expect(deactivateMasterUser(id)).rejects.toThrow("forbidden");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("reports server rejection without claiming success", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "self access forbidden" } });
    expect((await deactivateMasterUser(id)).ok).toBe(false);
  });
  it("rejects invalid IDs", async () => {
    expect((await deactivateMasterUser("bad")).ok).toBe(false);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
