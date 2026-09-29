import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
import { confirmUncoveredTrade } from "./uncovered-trade-actions";
const input = { batchId: "c0161118-7d0d-420e-b00e-de7d5780d184", resultInCents: 1160, confirmed: true };
beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } } }); mocks.rpc.mockResolvedValue({ error: null }); });
describe("broker-only confirmation action", () => {
  it("requires explicit confirmation before accessing the database", async () => {
    expect((await confirmUncoveredTrade({ ...input, confirmed: false })).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects non-integer amounts", async () => {
    expect((await confirmUncoveredTrade({ ...input, resultInCents: 11.6 })).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires an authenticated user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await confirmUncoveredTrade(input)).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("passes confirmation and the displayed amount to the owner-checked transaction", async () => {
    expect((await confirmUncoveredTrade(input)).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("confirm_ninja_uncovered_trade", { target_batch_id: input.batchId, target_result_cents: 1160, target_confirmed: true });
    expect(mocks.refresh).toHaveBeenCalledWith("/app");
  });
  it("never reports success or refreshes after a rejected confirmation", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "Trade amount changed; refresh before confirming" } });
    expect((await confirmUncoveredTrade(input)).ok).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
