import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { rows, rpc } = vi.hoisted(() => ({ rows: vi.fn(), rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc, from: (table: string) => {
  const filters: Record<string, unknown> = {};
  const query = {
    select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; },
    is: () => query, in: () => query, not: () => query, order: () => query, limit: () => query,
    maybeSingle: async () => rows(table, filters, true),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows(table, filters, false)).then(resolve),
  };
  return query;
} }) }));
import { persistAutomaticOperationBatches } from "./automatic-operation-processing";

const current = { id: 20, opening_event_id: 200, account_name: "2211575", connection_name: "En Vivo",
  opened_at: "2026-09-30T15:43:06Z", flat_at: "2026-09-30T15:49:23Z", last_event_at: "2026-09-30T15:49:25Z",
  settled_at: "2026-09-30T15:49:35Z", status: "closed", opening_balance: 5384.74, closing_balance: 5224.1,
  minimum_net_liquidation: null, minimum_net_liquidation_at: null, result: -160.64, execution_count: 3,
  instruments: ["MNQ DEC26"], direction: "Short", quantity: 3 };
const prop = { ...current, id: 21, opening_event_id: 201, account_name: "LFE05088021070010", connection_name: "Lucid Mauri",
  opened_at: "2026-09-30T15:43:15Z", opening_balance: 49994.75, closing_balance: 51504.5, result: 1509.75,
  instruments: ["NQ DEC26"], direction: "Long", execution_count: 2 };
const previous = { ...current, id: 10, opening_event_id: 100, opened_at: "2026-09-30T14:49:42Z",
  flat_at: "2026-09-30T14:56:47Z", last_event_at: "2026-09-30T14:56:49Z", settled_at: "2026-09-30T14:56:59Z",
  opening_balance: 5193.88, closing_balance: 5384.74, result: 190.86 };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
  rows.mockImplementation((table, filters, single) => {
    const data: Record<string, unknown> = {
      ninja_connectors: null,
      ninja_operation_probe_sessions: [previous, current, prop],
      ninja_account_links: [{ account_id: "account", connection_name: prop.connection_name, external_account_name: prop.account_name,
        first_seen_at: "2026-09-30T15:46:55Z", closed_at: null, life_id: null, phase: null, closure_reason: null }],
      ninja_inventory_snapshots: null,
      purchases: [{ account_id: "account", purchased_on: "2026-09-30" }],
      ninja_account_change_events: [],
      accounts: [{ id: "account", period_id: "period", company_id: "company" }],
      periods: [{ id: "period", operational_start_on: "2026-09-07", scheduled_close_at: "2026-10-02T22:00:00Z" }],
      operation_entries: [],
      ninja_operation_batches: single && filters.broker_session_id === 10
        ? { accounting_status: "committed", daily_control_id: "previous-control", accounting_period_id: "period" }
        : null,
    };
    if (!(table in data)) throw new Error(`Unexpected read ${table}`);
    return { data: data[table], error: null };
  });
});
afterEach(() => vi.unstubAllEnvs());

it("previews the late trade using the preceding committed balance, without writes", async () => {
  const result = await persistAutomaticOperationBatches("connector", 20, true);
  expect(result.previews).toEqual([expect.objectContaining({ brokerSessionId: 20, brokerResultInCents: -16064,
    projection: expect.objectContaining({ status: "shadow_ready", reason: null }),
    members: [expect.objectContaining({ accountId: "account", allocatedBrokerResultInCents: -16064 })],
  })]);
  expect(rpc).not.toHaveBeenCalled();
});

it("does not rewrite an operation already committed", async () => {
  const result = await persistAutomaticOperationBatches("connector", 10);
  expect(result.previews).toEqual([]);
  expect(rpc).not.toHaveBeenCalled();
});
