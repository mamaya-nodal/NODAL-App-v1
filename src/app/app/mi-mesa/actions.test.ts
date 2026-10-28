import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeMaster: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/admin/server/admin-access", () => ({
  requireNodalAdmin: mocks.authorizeMaster,
}));

import { saveDeskUser } from "./actions";

const userId = "00000000-0000-4000-8000-000000000099";
const deskId = "00000000-0000-4000-8000-000000000098";

describe("Admin Master desk mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeMaster.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      rpc: mocks.rpc,
    });
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId } } });
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it("authorizes Admin Master before changing a user or hierarchy", async () => {
    const result = await saveDeskUser({
      adminBps: 2500,
      assignedUserIds: [],
      commissionBps: 2500,
      contactEmail: "trader@example.test",
      dependencyDestinationDeskId: null,
      identitiesEnabled: false,
      membershipDeskId: deskId,
      role: "admin",
      state: "active",
      userId,
    });

    expect(result.ok).toBe(true);
    expect(mocks.authorizeMaster).toHaveBeenCalledWith("/app/admin");
    expect(mocks.rpc).toHaveBeenCalledWith("desk_admin_save_user_v2", expect.objectContaining({
      target_user_id: userId,
      target_is_admin: true,
    }));
  });

  it("does not reach the mutation when Admin Master authorization fails", async () => {
    mocks.authorizeMaster.mockRejectedValue(new Error("forbidden"));

    await expect(saveDeskUser({
      adminBps: 2500,
      assignedUserIds: [],
      commissionBps: 2500,
      contactEmail: "trader@example.test",
      dependencyDestinationDeskId: null,
      identitiesEnabled: false,
      membershipDeskId: deskId,
      role: "admin",
      state: "active",
      userId,
    })).rejects.toThrow("forbidden");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
