import { createClient } from "@supabase/supabase-js";

import { extractNinjaBrokerBalance } from "../domain/broker-balance-event";
import { isolatedNinjaConnectionNames } from "../domain/connection-access";
import {
  isNinjaInventorySnapshot,
  type NinjaInventorySnapshot,
} from "../domain/ingestion-payload";

export type BrokerBalanceProcessingResult = Readonly<{
  created: boolean;
  processed: boolean;
  reason?: "not_configured" | "no_verified_broker_balance" | "storage_error";
}>;

export async function processNinjaBrokerBalance(
  connectorId: string,
  snapshot: NinjaInventorySnapshot,
): Promise<BrokerBalanceProcessingResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return { created: false, processed: false, reason: "not_configured" };
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: reviewRows, error: reviewError } = await supabase
    .from("ninja_connector_connection_reviews")
    .select("connection_name,status")
    .eq("connector_id", connectorId)
    .eq("status", "isolated");
  if (reviewError) return { created: false, processed: false, reason: "storage_error" };

  const candidate = extractNinjaBrokerBalance(
    snapshot,
    isolatedNinjaConnectionNames(reviewRows ?? []),
  );
  if (!candidate) {
    return {
      created: false,
      processed: true,
      reason: "no_verified_broker_balance",
    };
  }

  const { data, error } = await supabase.rpc("commit_ninja_broker_balance", {
    target_balance_cents: candidate.balanceInCents,
    target_connector_id: connectorId,
    target_observed_at: snapshot.observedAt,
    target_source_accounts: candidate.sourceAccounts,
    target_source_event_id: snapshot.eventId,
  });

  return error
    ? { created: false, processed: false, reason: "storage_error" }
    : { created: data === true, processed: true };
}

export async function bootstrapNinjaBrokerBalance(
  connectorId: string,
): Promise<BrokerBalanceProcessingResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return { created: false, processed: false, reason: "not_configured" };
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: state, error: stateError } = await supabase
    .from("ninja_broker_balance_states")
    .select("connector_id")
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (stateError) return { created: false, processed: false, reason: "storage_error" };
  if (state) return { created: false, processed: true };

  const { data: latest, error: snapshotError } = await supabase
    .from("ninja_inventory_snapshots")
    .select("event_id, observed_at, accounts")
    .eq("connector_id", connectorId)
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (snapshotError) return { created: false, processed: false, reason: "storage_error" };
  if (!latest) return { created: false, processed: true };

  const snapshot = {
    accounts: latest.accounts,
    eventId: latest.event_id,
    kind: "inventory_snapshot",
    observedAt: latest.observed_at,
  };
  return isNinjaInventorySnapshot(snapshot)
    ? processNinjaBrokerBalance(connectorId, snapshot)
    : { created: false, processed: false, reason: "storage_error" };
}
