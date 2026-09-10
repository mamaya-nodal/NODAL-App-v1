import { createClient } from "@supabase/supabase-js";

import type { NinjaTelemetryRow } from "../domain/operation-probe";
import { classifyNinjaAccount } from "../domain/account-classification";
import { isolatedNinjaConnectionNames, isNinjaConnectionActive } from "../domain/connection-access";
import type { NinjaAccountSnapshot } from "../domain/ingestion-payload";
import { buildNinjaTechnicalOperations } from "../domain/technical-operation";
import { persistAutomaticOperationBatches } from "./automatic-operation-processing";

export async function refreshNinjaTechnicalOperations(connectorId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return { processedAccounts: 0, persistedOperations: 0 };

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [allowlistResult, linksResult, inventoryResult, reviewsResult] = await Promise.all([
    supabase
      .from("ninja_operation_probe_allowlist")
      .select("connection_name,account_name")
      .eq("connector_id", connectorId)
      .eq("enabled", true),
    supabase
      .from("ninja_account_links")
      .select("connection_name,external_account_name")
      .eq("connector_id", connectorId)
      .is("closed_at", null),
    supabase
      .from("ninja_inventory_snapshots")
      .select("accounts,observed_at")
      .eq("connector_id", connectorId)
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ninja_connector_connection_reviews")
      .select("connection_name,status")
      .eq("connector_id", connectorId)
      .eq("status", "isolated"),
  ]);
  if (allowlistResult.error || linksResult.error || inventoryResult.error || reviewsResult.error) {
    return { processedAccounts: 0, persistedOperations: 0 };
  }

  const isolatedConnections = isolatedNinjaConnectionNames(reviewsResult.data ?? []);
  const candidates = new Map<string, { account_name: string; connection_name: string }>();
  const add = (connectionName: string, accountName: string) => {
    if (!isNinjaConnectionActive(connectionName, isolatedConnections)) return;
    candidates.set(`${connectionName}\u0000${accountName}`, {
      account_name: accountName,
      connection_name: connectionName,
    });
  };
  for (const link of linksResult.data ?? []) add(link.connection_name, link.external_account_name);
  for (const account of (inventoryResult.data?.accounts ?? []) as NinjaAccountSnapshot[]) {
    const classification = classifyNinjaAccount(account, inventoryResult.data?.observed_at ?? new Date().toISOString());
    if (classification.type === "broker") {
      add(account.connectionName, account.accountName);
    }
  }
  // La allowlist conserva únicamente la excepción de prueba Sim101. Ya no es
  // necesaria para cuentas reales vinculadas o brokers inequívocos.
  for (const account of allowlistResult.data ?? []) add(account.connection_name, account.account_name);
  const observedAccounts = [...candidates.values()];
  if (!observedAccounts.length) return { processedAccounts: 0, persistedOperations: 0 };

  let persistedOperations = 0;
  for (const account of observedAccounts) {
    const { data, error } = await supabase
      .from("ninja_trade_telemetry_events")
      .select("id,event_type,occurred_at,connection_name,account_name,instrument,payload")
      .eq("connector_id", connectorId)
      .eq("connection_name", account.connection_name)
      .eq("account_name", account.account_name)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
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
  return { processedAccounts: observedAccounts.length, persistedOperations, ...batches };
}
