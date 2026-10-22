import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/admin/server/load-master-control", () => ({ loadMasterControl: mocks.load }));
vi.mock("../mi-mesa/actions", () => ({ saveDeskUser: mocks.save }));
import { saveMasterAssignments } from "./assignment-actions";
const trader = "00000000-0000-4000-8000-000000000099";

describe("Master user assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue({ overview: {
      people: [{ id: "manager", deskId: "parent", terms: { state: "active", commission_bps: 2500 } }],
      desks: [{ id: "desk", terms: { active: true, manager_id: "manager", nodal_bps: 1000 } }],
    }, profilesByUser: { manager: { email: "manager@example.test", contact_email: null, identities_enabled: true } } });
    mocks.save.mockResolvedValue({ ok: true });
  });
  it("preserves saved terms and sends only the selected membership change", async () => {
    expect((await saveMasterAssignments({ userId: "manager", assignedUserIds: [trader] })).ok).toBe(true);
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: "manager", assignedUserIds: [trader], adminBps: 1000, commissionBps: 2500,
      membershipDeskId: "parent", identitiesEnabled: true, role: "admin",
    }));
  });
  it("does not write when the master authorization fails", async () => {
    mocks.load.mockRejectedValue(new Error("forbidden"));
    await expect(saveMasterAssignments({ userId: "manager", assignedUserIds: [] })).rejects.toThrow("forbidden");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("requires a saved active management role", async () => {
    expect((await saveMasterAssignments({ userId: "outsider", assignedUserIds: [] })).ok).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("reports rejected cycles instead of claiming success", async () => {
    mocks.save.mockResolvedValue({ ok: false, message: "Ese traslado formaría un círculo." });
    expect((await saveMasterAssignments({ userId: "manager", assignedUserIds: [trader] })).ok).toBe(false);
    expect(mocks.save).toHaveBeenCalledOnce();
  });
});
