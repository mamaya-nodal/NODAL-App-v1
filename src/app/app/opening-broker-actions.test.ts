import { beforeEach, describe, expect, it, vi } from "vitest";

const { client, state, revalidate } = vi.hoisted(() => ({ client: vi.fn(), state: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: client }));
vi.mock("@/modules/ninja/server/opening-broker-state", () => ({ readOpeningBrokerState: state }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
import { claimOpeningBrokerAccount } from "./opening-broker-actions";

const candidate = { physicalConnectorId: "00000000-0000-4000-8000-000000000001", accountName: "1850465", connectionName: "Live" };
describe("opening broker confirmation authorization", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("requires an authenticated session before consulting or confirming accounts", async () => {
    const rpc = vi.fn(); client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) }, rpc });
    expect((await claimOpeningBrokerAccount(candidate)).ok).toBe(false);
    expect(state).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects a forged account outside the current users personal candidates", async () => {
    const rpc = vi.fn(); client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "user" } } }) }, rpc });
    state.mockResolvedValue({ liveBrokerBalance: null, pendingAccounts: [] });
    expect((await claimOpeningBrokerAccount(candidate)).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses the audited claim RPC and immediately rereads the server balance", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "user" } } }) }, rpc });
    state.mockResolvedValueOnce({ liveBrokerBalance: null, pendingAccounts: [candidate] })
      .mockResolvedValueOnce({ liveBrokerBalance: { balanceInCents: 698204 }, pendingAccounts: [] });
    const result = await claimOpeningBrokerAccount(candidate);
    expect(result).toMatchObject({ ok: true, liveBrokerBalance: { balanceInCents: 698204 }, pendingAccounts: [] });
    expect(rpc).toHaveBeenCalledWith("claim_ninja_broker_account", {
      target_account_name: candidate.accountName, target_connection_name: candidate.connectionName,
      target_physical_connector_id: candidate.physicalConnectorId,
    });
    expect(revalidate).toHaveBeenCalledWith("/app");
  });
});
