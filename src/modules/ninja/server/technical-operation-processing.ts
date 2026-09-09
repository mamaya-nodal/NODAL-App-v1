import { createClient } from "@supabase/supabase-js";

import type { NinjaTelemetryRow } from "../domain/operation-probe";
import { buildNinjaTechnicalOperations } from "../domain/technical-operation";
import { persistAutomaticOperationBatches } from "./automatic-operation-processing";

export async function refreshNinjaTechnicalOperations(connectorId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return { processedAccounts: 0, persistedOperations: 0 };

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: allowlisted, error: allowlistError } = await supabase
    .from("ninja_operation_probe_allowlist")
    .select("connection_name,account_name")
    .eq("connector_id", connectorId)
    .eq("enabled", true);
  if (allowlistError || !allowlisted?.length) return { processedAccounts: 0, persistedOperations: 0 };

  let persistedOperations = 0;
  for (const account of allowlisted) {
    const { data, error } = await supabase
      .from("ninja_trade_telemetry_events")
      .select("id,event_type,occurred_at,connection_name,account_name,instrument,payload")
      .eq("connector_id", connectorId)
      .eq("connection_name", account.connection_name)
      .eq("account_name", account.account_name)
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(5_000);
    if (error || !data?.length) continue;

    const rows = data.map((row) => ({
      account_name: row.account_name,
      connection_name: row.connection_name,
      event_type: row.event_type,
      id: Number(row.id),
      instrument: row.instrument,
      occurred_at: row.occurred_at,
      payload: row.payload,
    })) as NinjaTelemetryRow[];
    const operations = buildNinjaTechnicalOperations(rows, new Date());
    if (!operations.length) continue;

    const { error: upsertError } = await supabase
      .from("ninja_operation_probe_sessions")
      .upsert(operations.map((operation) => ({
        account_name: operation.accountName,
        closing_balance: operation.closingBalance,
        connection_name: operation.connectionName,
        connector_id: connectorId,
        direction: operation.direction,
        execution_count: operation.executionCount,
        flat_at: operation.flatAt,
        instruments: operation.instruments,
        last_event_at: operation.lastEventAt,
        opened_at: operation.openedAt,
        opening_balance: operation.openingBalance,
        opening_event_id: operation.openingEventId,
        quantity: operation.quantity,
        result: operation.result,
        settled_at: operation.settledAt,
        status: operation.status,
        updated_at: new Date().toISOString(),
      })), { onConflict: "connector_id,opening_event_id" });
    if (!upsertError) persistedOperations += operations.length;
  }

  const batches = await persistAutomaticOperationBatches(connectorId);
  return { processedAccounts: allowlisted.length, persistedOperations, ...batches };
}
