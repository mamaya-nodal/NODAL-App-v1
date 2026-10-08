import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NinjaBalanceTelemetryEvent } from "../domain/trade-telemetry";

const { serviceClient } = vi.hoisted(() => ({ serviceClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: serviceClient }));
import { readOpeningBrokerState } from "./opening-broker-state";

type Row = Record<string, unknown>;
function database(tables: Record<string, Row[]>, rpcs: Record<string, Row[]> = {}) {
  const calls: { table: string; filters: [string, unknown][] }[] = [];
  return { calls, rpc: vi.fn(async (name: string) => ({ data: rpcs[name] ?? [], error: null })),
    from: (table: string) => {
      const call = { table, filters: [] as [string, unknown][] }; calls.push(call);
      let rows = tables[table] ?? [];
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => { call.filters.push([field, value]); rows = rows.filter((row) => {
          const actual = field.startsWith("payload->>") ? (row.payload as Row)[field.slice(10)] : row[field];
          return actual === value;
        }); return query; },
        in: (field: string, values: unknown[]) => { call.filters.push([field, values]); rows = rows.filter((row) => values.includes(row[field])); return query; },
        order: () => query, limit: (n: number) => { rows = rows.slice(0, n); return query; },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolve: (result: { data: Row[]; error: null }) => unknown) => Promise.resolve(resolve({ data: rows, error: null })),
      };
      return query;
    } };
}
const connectors = [{ connector_id: "own", status: "active", identity_id: null },
  { connector_id: "identity", status: "active", identity_id: "identity-id" }];
const pending = (destination = "own", name = "1850465", at = "2026-10-08T12:29:47Z") => ({
  physical_connector_id: "physical", proposed_destination_connector_id: destination, connection_name: "Live",
  account_name: name, last_observed_at: at, latest_balance_cents: 698204,
});
const owned = (destination = "own") => ({ owner_user_id: "user", account_type: "broker", physical_connector_id: "physical",
  connection_name: "Live", account_name: "1850465", destination_connector_id: destination, claimed_at: "2026-10-08T12:40:00Z" });
const payload: NinjaBalanceTelemetryEvent = { kind: "balance", eventId: "real-event", occurredAt: "2026-10-08T12:29:47Z",
  accountName: "1850465", connectionName: "Live", providerName: "Provider31", cashValue: 6982.04,
  netLiquidation: 6982.04, totalCashBalance: 0, realizedProfitLoss: 0, unrealizedProfitLoss: 0 };
const inventories = [{ connector_id: "own", observed_at: "2026-10-08T12:29:48Z", accounts: [] }];
function userDatabase(ownership: Row[] = [], pendingRows: Row[] = [pending()]) {
  return database({ ninja_unclaimed_broker_accounts: pendingRows, ninja_account_ownership: ownership },
    { get_current_user_ninja_connector_status_v2: connectors });
}

describe("opening broker read authorization and recovery", () => {
  beforeEach(() => { serviceClient.mockReset(); });
  it("shows current personal pending accounts without counting them; excludes identities and obsolete broker connections", async () => {
    const user = userDatabase([], [pending(), pending("identity"), pending("own", "1770014", "2026-10-07T19:52:00Z")]);
    const service = database({}); serviceClient.mockReturnValue(service);
    const result = await readOpeningBrokerState(user as unknown as SupabaseClient, "user", inventories);
    expect(result.liveBrokerBalance).toBeNull();
    expect(result.pendingAccounts.map((account) => account.accountName)).toEqual(["1850465"]);
    expect(service.calls.filter((call) => call.table === "ninja_event_receipts").length).toBe(2);
  });
  it("recovers only the receipt matching authenticated ownership and preserves its observation time", async () => {
    const user = userDatabase([owned()], []);
    const service = database({ ninja_event_receipts: [{ physical_connector_id: "physical", payload, status: "pending" }] });
    serviceClient.mockReturnValue(service);
    const result = await readOpeningBrokerState(user as unknown as SupabaseClient, "user", inventories);
    expect(result.liveBrokerBalance?.balanceInCents).toBe(698204);
    expect(result.liveBrokerBalance?.observedAt).toBe(payload.occurredAt);
    expect(service.calls[1].filters).toContainEqual(["physical_connector_id", "physical"]);
    expect(service.calls[1].filters).toContainEqual(["payload->>accountName", "1850465"]);
    expect(user.calls.find((call) => call.table === "ninja_account_ownership")?.filters).toContainEqual(["owner_user_id", "user"]);
  });
  it("does not recover accounts assigned to an identity or an isolated connection", async () => {
    const user = userDatabase([owned("identity"), owned()], [pending()]);
    serviceClient.mockReturnValue(database({ ninja_connector_connection_reviews: [{ connector_id: "own", connection_name: "Live", status: "isolated" }] }));
    const result = await readOpeningBrokerState(user as unknown as SupabaseClient, "user", inventories);
    expect(result).toEqual({ liveBrokerBalance: null, pendingAccounts: [] });
  });
  it("a delayed retry cannot hide a current pending account when the original latest receipt exists", async () => {
    const user = userDatabase([], [pending("own", "1850465", "2026-10-07T20:27:31Z")]);
    serviceClient.mockReturnValue(database({ ninja_event_receipts: [{ physical_connector_id: "physical", payload, status: "pending" }] }));
    const result = await readOpeningBrokerState(user as unknown as SupabaseClient, "user", inventories);
    expect(result.pendingAccounts[0]?.observedAt).toBe(payload.occurredAt);
    expect(result.pendingAccounts[0]?.balanceInCents).toBe(698204);
  });
});
