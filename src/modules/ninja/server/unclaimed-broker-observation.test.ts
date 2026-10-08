import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { NinjaAccountSnapshot } from "../domain/ingestion-payload";
import { rememberUnclaimedBroker } from "./intake-routing";

function pendingStore() {
  let row: Record<string, unknown> | null = null;
  const db = { from: () => ({
    upsert: async (next: Record<string, unknown>, options: { ignoreDuplicates: boolean }) => {
      if (!row || !options.ignoreDuplicates) row = next;
      return { error: null };
    },
    update: (next: Record<string, unknown>) => {
      const q = { eq: () => q, lt: async (field: string, value: string) => {
        if (row && Date.parse(row[field] as string) < Date.parse(value)) row = { ...row, ...next };
        return { error: null };
      } };
      return q;
    },
  }) };
  return { db: db as unknown as SupabaseClient, row: () => row };
}
const broker: NinjaAccountSnapshot = { accountName: "1850465", connectionName: "Live", providerName: "Provider31",
  connectionStatus: "Connected", cashValue: 6982.04, netLiquidation: 6982.04, totalCashBalance: null,
  realizedProfitLoss: 0, unrealizedProfitLoss: 0 };

describe("pending broker observations preserve chronological order", () => {
  it("does not let an older receipt overwrite latest balance, date or proposed owner", async () => {
    const store = pendingStore();
    await rememberUnclaimedBroker({ account: broker, destinationConnectorId: "current", physicalConnectorId: "physical",
      observedAt: "2026-10-08T12:29:47Z", supabase: store.db });
    await rememberUnclaimedBroker({ account: { ...broker, cashValue: 6500 }, destinationConnectorId: "old", physicalConnectorId: "physical",
      observedAt: "2026-10-07T20:27:31Z", supabase: store.db });
    expect(store.row()).toMatchObject({ latest_balance_cents: 698204, last_observed_at: "2026-10-08T12:29:47Z", proposed_destination_connector_id: "current" });
  });
  it("advances on a newer observation and retains the first detection timestamp", async () => {
    const store = pendingStore();
    await rememberUnclaimedBroker({ account: broker, destinationConnectorId: "own", physicalConnectorId: "physical",
      observedAt: "2026-10-08T12:29:47Z", supabase: store.db });
    await rememberUnclaimedBroker({ account: { ...broker, cashValue: 7000 }, destinationConnectorId: "own", physicalConnectorId: "physical",
      observedAt: "2026-10-08T12:41:00Z", supabase: store.db });
    expect(store.row()).toMatchObject({ latest_balance_cents: 700000, last_observed_at: "2026-10-08T12:41:00Z", first_observed_at: "2026-10-08T12:29:47Z" });
  });
});
