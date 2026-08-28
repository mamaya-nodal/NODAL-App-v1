import { createClient } from "@supabase/supabase-js";

import type { NinjaInventorySnapshot } from "../domain/ingestion-payload";

export type SnapshotPersistenceResult =
  | Readonly<{ persisted: true }>
  | Readonly<{ persisted: false; reason: "not_configured" | "storage_error" }>;

export async function persistNinjaSnapshot(
  connectorId: string,
  snapshot: NinjaInventorySnapshot,
): Promise<SnapshotPersistenceResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return { persisted: false, reason: "not_configured" };

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.from("ninja_inventory_snapshots").upsert({
    account_count: snapshot.accounts.length,
    accounts: snapshot.accounts,
    connector_id: connectorId,
    event_id: snapshot.eventId,
    machine_id: null,
    observed_at: snapshot.observedAt,
  }, { onConflict: "event_id", ignoreDuplicates: true });

  return error ? { persisted: false, reason: "storage_error" } : { persisted: true };
}
