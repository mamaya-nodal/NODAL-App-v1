import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NinjaBalanceTelemetryEvent } from "../domain/trade-telemetry";
import { DataReadError } from "@/lib/supabase/require-read";

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
function userDatabase(ownership: Row[] = []) {
  return database({ ninja_account_ownership: ownership },
    { get_current_user_ninja_connector_status_v2: connectors });
}

describe("opening broker read authorization and recovery", () => {
  beforeEach(() => { serviceClient.mockReset(); });
  it("shows current personal pending accounts without counting them; excludes identities and obsolete broker connections", async () => {
    const user = userDatabase();
    const service = database({ ninja_unclaimed_broker_accounts: [pending(), pending("identity"),
      pending("other-user"), pending("own", "1770014", "2026-10-07T19:52:00Z")] }); serviceClient.mockReturnValue(service);
    const result = await readOpeningBrokerState(user as unknown as SupabaseClient, "user", inventories);
    expect(result.liveBrokerBalance).toBeNull();
    expect(result.pendingAccounts.map((account) => account.accountName)).toEqual(["1850465"]);
    expect(service.calls.filter((call) => call.table === "ninja_event_receipts").length).toBe(2);
    expect(user.calls.some((call) => call.table === "ninja_unclaimed_broker_accounts")).toBe(false);
    expect(service.calls.find((call) => call.table === "ninja_unclaimed_broker_accounts")?.filters)
      .toContainEqual(["proposed_destination_connector_id", ["own"]]);
  });
  it("offers one confirmation when two physical Ninjas report the same economic broker account", async () => {
    const user = userDatabase();
    const personal = pending("own", "2141240", "2026-10-27T13:07:59Z");
    const identity = { ...pending("own", "2141240", "2026-10-27T15:20:39Z"),
      connection_name: "Broker", physical_connector_id: "identity-physical" };
    serviceClient.mockReturnValue(database({ ninja_unclaimed_broker_accounts: [personal, identity] }));
    const result = await readOpeningBrokerState(user as unknown as SupabaseClient, "user", [{
      connector_id: "own", observed_at: "2026-10-27T15:20:40Z", accounts: [],
    }]);
    expect(result.pendingAccounts).toEqual([{
      accountName: "2141240", balanceInCents: 698204, connectionName: "Broker",
      observedAt: "2026-10-27T15:20:39Z", physicalConnectorId: "identity-physical",
    }]);
  });
  it("offers every different broker partition until the user confirms or discards it", async () => {
    const user = userDatabase();
    serviceClient.mockReturnValue(database({ ninja_unclaimed_broker_accounts: [
      pending("own", "2177299", "2026-10-29T14:22:51Z"),
      pending("own", "2292943", "2026-10-29T14:22:52Z"),
    ] }));
    const result = await readOpeningBrokerState(user as unknown as SupabaseClient, "user", [{
      connector_id: "own", observed_at: "2026-10-29T14:22:53Z", accounts: [],
    }]);
    expect(result.pendingAccounts.map((account) => account.accountName).sort())
      .toEqual(["2177299", "2292943"]);
  });
  it("excludes a discarded broker partition from both the balance and pending choices", async () => {
    const user = database({
      ninja_account_ownership: [owned()],
      ninja_broker_account_exclusions: [{ owner_user_id: "user", account_name: "1850465" }],
    }, { get_current_user_ninja_connector_status_v2: connectors });
    serviceClient.mockReturnValue(database({ ninja_unclaimed_broker_accounts: [pending()] }));
    const result = await readOpeningBrokerState(user as unknown as SupabaseClient, "user", [{
      connector_id: "own", observed_at: "2026-10-08T12:29:48Z", accounts: [{
        accountName: "1850465", cashValue: 6982.04, connectionName: "Live",
        connectionStatus: "Connected", netLiquidation: 6982.04, providerName: "Provider31",
        realizedProfitLoss: 0, totalCashBalance: 6982.04, unrealizedProfitLoss: 0,
      }],
    }]);
    expect(result).toEqual({ liveBrokerBalance: null, pendingAccounts: [] });
  });
  it("recovers only the receipt matching authenticated ownership and preserves its observation time", async () => {
    const user = userDatabase([owned()]);
    const service = database({ ninja_event_receipts: [{ physical_connector_id: "physical", payload, status: "pending" }] });
    serviceClient.mockReturnValue(service);
    const result = await readOpeningBrokerState(user as unknown as SupabaseClient, "user", inventories);
    expect(result.liveBrokerBalance?.balanceInCents).toBe(698204);
    expect(result.liveBrokerBalance?.observedAt).toBe(payload.occurredAt);
    expect(service.calls.find((call) => call.table === "ninja_event_receipts")?.filters).toContainEqual(["physical_connector_id", "physical"]);
    expect(service.calls.find((call) => call.table === "ninja_event_receipts")?.filters).toContainEqual(["payload->>accountName", "1850465"]);
    expect(user.calls.find((call) => call.table === "ninja_account_ownership")?.filters).toContainEqual(["owner_user_id", "user"]);
  });
  it("does not recover accounts assigned to an identity or an isolated connection", async () => {
    const user = userDatabase([owned("identity"), owned()]);
    serviceClient.mockReturnValue(database({ ninja_unclaimed_broker_accounts: [pending()],
      ninja_connector_connection_reviews: [{ connector_id: "own", connection_name: "Live", status: "isolated" }] }));
    const result = await readOpeningBrokerState(user as unknown as SupabaseClient, "user", inventories);
    expect(result).toEqual({ liveBrokerBalance: null, pendingAccounts: [] });
  });
  it("a delayed retry cannot hide a current pending account when the original latest receipt exists", async () => {
    const user = userDatabase();
    serviceClient.mockReturnValue(database({ ninja_unclaimed_broker_accounts: [pending("own", "1850465", "2026-10-07T20:27:31Z")],
      ninja_event_receipts: [{ physical_connector_id: "physical", payload, status: "pending" }] }));
    const result = await readOpeningBrokerState(user as unknown as SupabaseClient, "user", inventories);
    expect(result.pendingAccounts[0]?.observedAt).toBe(payload.occurredAt);
    expect(result.pendingAccounts[0]?.balanceInCents).toBe(698204);
  });
  it("never makes an unscoped privileged read when no active personal destination is authorized", async () => {
    const user = database({ ninja_account_ownership: [] }, {
      get_current_user_ninja_connector_status_v2: [connectors[1], { connector_id: "revoked", status: "revoked", identity_id: null }],
    });
    const service = database({ ninja_unclaimed_broker_accounts: [pending()] });
    serviceClient.mockReturnValue(service);
    const result = await readOpeningBrokerState(user as unknown as SupabaseClient, "user", []);
    expect(result).toEqual({ liveBrokerBalance: null, pendingAccounts: [] });
    expect(service.calls).toEqual([]);
  });
  it("fails closed before privileged reads when authenticated connector authorization fails", async () => {
    const user = userDatabase();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    user.rpc.mockResolvedValue({ data: [], error: { code: "42501" } } as never);
    await expect(readOpeningBrokerState(user as unknown as SupabaseClient, "user", [])).rejects.toBeInstanceOf(DataReadError);
    expect(serviceClient).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("NODAL_READ_FAILED", { scope: "opening-connectors", code: "42501", status: undefined });
    log.mockRestore();
  });
});
