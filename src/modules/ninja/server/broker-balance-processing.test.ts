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

import { bootstrapNinjaBrokerBalance, ensureNinjaBrokerBalanceBaseline, recordNinjaBrokerPreOperationBalance } from "./broker-balance-processing";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
});

afterEach(() => vi.unstubAllEnvs());

it("checks new inventory cash even when the connector already has a baseline", async () => {
  reads.mockImplementation((table) => ({ data: table === "ninja_broker_balance_states" ? { connector_id: "personal" } : [], error: null }));
  rpc.mockResolvedValue({ data: true, error: null });
  await expect(ensureNinjaBrokerBalanceBaseline("personal", {
    eventId: "inventory-new-cash", kind: "inventory_snapshot", observedAt: "2026-11-13T19:07:00Z",
    accounts: [{ accountName: "2234971", connectionName: "Live", connectionStatus: "Connected", providerName: "NinjaTrader", cashValue: 9930.08, netLiquidation: 9930.08, totalCashBalance: null, realizedProfitLoss: 0, unrealizedProfitLoss: 0 }],
  })).resolves.toEqual({ created: true, processed: true });
  expect(rpc).toHaveBeenCalledWith("observe_ninja_broker_inventory_difference", expect.objectContaining({ target_balance_cents: 993008, target_realized_cents: 0 }));
});

it("persists pre-operation differences atomically instead of stopping at any old pending event", async () => {
  rpc.mockResolvedValue({ data: true, error: null });
  await expect(recordNinjaBrokerPreOperationBalance({ accountName: "2234971", connectionName: "Live", connectorId: "personal", balanceInCents: 993008, expectedBalanceInCents: 137908, observedAt: "2026-11-13T19:51:00Z", openingEventId: 1356951, baselineObservedAt: "2026-11-11T19:00:00Z" })).resolves.toEqual({ created: true, processed: true });
  expect(reads).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith("record_ninja_broker_balance_difference", expect.objectContaining({ target_baseline_at: "2026-11-11T19:00:00Z", target_expected_cents: 137908 }));
});

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
