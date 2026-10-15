import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}));

import { claimBrokerAccount } from "./broker-account-actions";

describe("broker account confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "4da1b67b-daf7-4e6d-99af-bfe94a93d981" } } });
  });

  it("confirms a broker account independently from identities", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const result = await claimBrokerAccount({
      accountName: "2149906",
      connectionName: "Live",
      physicalConnectorId: "69b6c516-c0d8-4691-862b-2b15af76bd10",
    });
    expect(result).toEqual({ message: "Cuenta broker 2149906 confirmada para tu espacio NODAL.", ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("claim_ninja_broker_account", {
      target_account_name: "2149906",
      target_connection_name: "Live",
      target_physical_connector_id: "69b6c516-c0d8-4691-862b-2b15af76bd10",
    });
  });
});
