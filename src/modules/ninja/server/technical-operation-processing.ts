import { createClient } from "@supabase/supabase-js";

import type { NinjaTelemetryRow } from "../domain/operation-probe";
import { classifyNinjaAccount } from "../domain/account-classification";
import { isolatedNinjaConnectionNames, isNinjaConnectionActive } from "../domain/connection-access";
import type { NinjaAccountSnapshot } from "../domain/ingestion-payload";
import { buildNinjaTechnicalOperations, type NinjaTechnicalOperation } from "../domain/technical-operation";
import { persistAutomaticOperationBatches } from "./automatic-operation-processing";
import { processNinjaOperationBurns } from "./transition-processing";

export async function refreshNinjaTechnicalOperations(connectorId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return { processedAccounts: 0, persistedOperations: 0 };

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [allowlistResult, linksResult, inventoryResult, reviewsResult, unsettledResult] = await Promise.all([
    supabase
      .from("ninja_operation_probe_allowlist")
      .select("connection_name,account_name")
      .eq("connector_id", connectorId)
      .eq("enabled", true),
    supabase
      .from("ninja_account_links")
      .select("connection_name,external_account_name")
      .eq("connector_id", connectorId),
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
    supabase
      .from("ninja_operation_probe_sessions")
      .select("id,connection_name,account_name,opened_at,opening_event_id,status,opening_balance")
      .eq("connector_id", connectorId)
      .or("status.neq.closed,opening_balance.is.null")
      .order("opened_at"),
  ]);
  if (allowlistResult.error || linksResult.error || inventoryResult.error || reviewsResult.error || unsettledResult.error) {
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

  const operationCounts = await Promise.all(observedAccounts.map(async (account) => {
    const unsettled = (unsettledResult.data ?? []).filter((session) =>
      session.connection_name === account.connection_name &&
      session.account_name === account.account_name,
    );
    let startAt: string;
    if (unsettled.length > 0) {
      startAt = new Date(Date.parse(unsettled[0].opened_at) - 5 * 60_000).toISOString();
    } else {
      const { data: latestClosed } = await supabase
        .from("ninja_operation_probe_sessions")
        .select("last_event_at")
        .eq("connector_id", connectorId)
        .eq("connection_name", account.connection_name)
        .eq("account_name", account.account_name)
        .eq("status", "closed")
        .order("last_event_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      startAt = latestClosed?.last_event_at ?? new Date(Date.now() - 12 * 60 * 60_000).toISOString();
    }

    const data: Array<Record<string, unknown>> = [];
    const pageSize = 1_000;
    for (let offset = 0; ; offset += pageSize) {
      const { data: page, error } = await supabase
        .from("ninja_trade_telemetry_events")
        .select("id,event_type,occurred_at,connection_name,account_name,instrument,payload")
        .eq("connector_id", connectorId)
        .eq("connection_name", account.connection_name)
        .eq("account_name", account.account_name)
        .gte("occurred_at", startAt)
        .order("occurred_at")
        .order("id")
        .range(offset, offset + pageSize - 1);
      if (error || !page) {
        data.length = 0;
        break;
      }
      data.push(...page);
      if (page.length < pageSize) break;
    }
    if (!data.length) return 0;

    const rows = data.map((row) => ({
      account_name: row.account_name,
      connection_name: row.connection_name,
      event_type: row.event_type,
      id: Number(row.id),
      instrument: row.instrument,
      occurred_at: row.occurred_at,
      payload: row.payload,
    })) as NinjaTelemetryRow[];
    const { data: baselineInventory } = await supabase
      .from("ninja_inventory_snapshots")
      .select("accounts,observed_at")
      .eq("connector_id", connectorId)
      .lte("observed_at", rows[0].occurred_at)
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const baselineAccount = ((baselineInventory?.accounts ?? []) as NinjaAccountSnapshot[]).find((candidate) =>
      candidate.connectionName === account.connection_name && candidate.accountName === account.account_name,
    );
    const baselineBalance = baselineAccount?.cashValue !== null && baselineAccount?.cashValue !== undefined
      ? baselineAccount.cashValue
      : null;
    const operations = buildNinjaTechnicalOperations(rows, new Date(), baselineBalance);
    if (!operations.length) return 0;

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
        minimum_net_liquidation: operation.minimumNetLiquidation,
        minimum_net_liquidation_at: operation.minimumNetLiquidationAt,
        opened_at: operation.openedAt,
        opening_balance: operation.openingBalance,
        opening_event_id: operation.openingEventId,
        quantity: operation.quantity,
        result: operation.result,
        settled_at: operation.settledAt,
        status: operation.status,
        updated_at: new Date().toISOString(),
      })), { onConflict: "connector_id,opening_event_id" });
    if (!upsertError) {
      const validOpeningIds = new Set(operations.map((operation) => operation.openingEventId));
      const staleIds = unsettled
        .filter((session) => session.status !== "closed")
        .filter((session) => !validOpeningIds.has(Number(session.opening_event_id)))
        .map((session) => session.id);
      // Retira artefactos creados cuando el límite anterior de 1.000 filas
      // cortaba una operación larga y confundía su cierre con otra apertura.
      if (staleIds.length > 0) {
        await supabase.from("ninja_operation_probe_sessions").delete().in("id", staleIds);
      }
      return operations.length;
    }
    return 0;
  }));

  const batches = await persistAutomaticOperationBatches(connectorId);
  const { data: burnRows } = await supabase
    .from("ninja_operation_probe_sessions")
    .select("account_name,closing_balance,connection_name,direction,execution_count,flat_at,instruments,last_event_at,minimum_net_liquidation,minimum_net_liquidation_at,opened_at,opening_balance,opening_event_id,quantity,result,settled_at,status")
    .eq("connector_id", connectorId)
    .eq("status", "closed")
    .not("minimum_net_liquidation", "is", null);
  await processNinjaOperationBurns(connectorId, (burnRows ?? []).map((operation) => ({
    accountName: operation.account_name,
    closingBalance: operation.closing_balance === null ? null : Number(operation.closing_balance),
    connectionName: operation.connection_name,
    direction: operation.direction as NinjaTechnicalOperation["direction"],
    executionCount: operation.execution_count,
    flatAt: operation.flat_at,
    instruments: operation.instruments,
    lastEventAt: operation.last_event_at,
    minimumNetLiquidation: operation.minimum_net_liquidation === null ? null : Number(operation.minimum_net_liquidation),
    minimumNetLiquidationAt: operation.minimum_net_liquidation_at,
    openedAt: operation.opened_at,
    openingBalance: operation.opening_balance === null ? null : Number(operation.opening_balance),
    openingEventId: Number(operation.opening_event_id),
    quantity: operation.quantity,
    result: operation.result === null ? null : Number(operation.result),
    settledAt: operation.settled_at,
    status: operation.status as NinjaTechnicalOperation["status"],
  })));
  return {
    processedAccounts: observedAccounts.length,
    persistedOperations: operationCounts.reduce((total, count) => total + count, 0),
    ...batches,
  };
}
