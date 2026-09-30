import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { reads, rpc } = vi.hoisted(() => ({ reads: vi.fn(), rpc: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const query = {
        eq: () => query,
        limit: () => query,
        maybeSingle: async () => reads(table, true),
        order: () => query,
        select: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(reads(table, false)).then(resolve),
      };
      return query;
    },
    rpc,
  }),
}));

import { bootstrapNinjaBrokerBalance } from "./broker-balance-processing";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
});

afterEach(() => vi.unstubAllEnvs());

it("does not rebuild a stale balance on a physical connector with another destination", async () => {
  reads.mockImplementation((table, single) => {
    if (table === "ninja_connector_destinations" && !single) return {
      data: [
        { destination_connector_id: "physical" },
        { destination_connector_id: "personal" },
      ],
      error: null,
    };
    throw new Error(`Unexpected read ${table}`);
  });

  await expect(bootstrapNinjaBrokerBalance("physical")).resolves.toEqual({
    created: false,
    processed: true,
  });
  expect(rpc).not.toHaveBeenCalled();
});

it("keeps legacy self-only connectors eligible for bootstrap", async () => {
  reads.mockImplementation((table, single) => {
    if (table === "ninja_connector_destinations" && !single) return {
      data: [{ destination_connector_id: "physical" }],
      error: null,
    };
    if (table === "ninja_inventory_snapshots" && single) return { data: null, error: null };
    throw new Error(`Unexpected read ${table}`);
  });

  await expect(bootstrapNinjaBrokerBalance("physical")).resolves.toEqual({
    created: false,
    processed: true,
  });
  expect(reads).toHaveBeenCalledWith("ninja_inventory_snapshots", true);
  expect(rpc).not.toHaveBeenCalled();
});
