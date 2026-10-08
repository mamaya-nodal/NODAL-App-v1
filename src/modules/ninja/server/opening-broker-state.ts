import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { buildBrokerBalanceAfterClaim, type ClaimedBrokerObservation, type PendingOpeningBrokerAccount } from "../domain/broker-claim-balance";
import type { NinjaInventoryView } from "../domain/live-broker-balance";
import { isNinjaTradeTelemetryBatch, type NinjaBalanceTelemetryEvent } from "../domain/trade-telemetry";

/** Caller is authenticated. User queries enforce RLS; privileged receipt reads
 * are restricted to the exact owned or proposed broker rows returned for that user. */
export async function readOpeningBrokerState(userClient: SupabaseClient, userId: string,
  suppliedInventories?: readonly (NinjaInventoryView & { connector_id: string })[]) {
  const [inventoryResult, connectorResult, pendingResult, ownershipResult] = await Promise.all([
    suppliedInventories ? Promise.resolve({ data: suppliedInventories, error: null })
      : userClient.rpc("get_current_user_ninja_inventory"),
    userClient.rpc("get_current_user_ninja_connector_status_v2"),
    userClient.from("ninja_unclaimed_broker_accounts")
      .select("physical_connector_id,connection_name,account_name,proposed_destination_connector_id,last_observed_at,latest_balance_cents"),
    userClient.from("ninja_account_ownership")
      .select("physical_connector_id,connection_name,account_name,destination_connector_id,claimed_at")
      .eq("owner_user_id", userId).eq("account_type", "broker"),
  ]);
  for (const result of [inventoryResult, connectorResult, pendingResult, ownershipResult]) {
    if (result.error) throw new Error("No se pudo consultar el estado broker.");
  }
  const inventories = (inventoryResult.data ?? []) as (NinjaInventoryView & { connector_id: string })[];
  const personalIds = new Set<string>((connectorResult.data ?? [])
    .filter((row: { identity_id: string | null; status: string }) => row.identity_id === null && row.status === "active")
    .map((row: { connector_id: string }) => row.connector_id));
  const service = createServiceClient();
  const reviewResult = personalIds.size > 0
    ? await service.from("ninja_connector_connection_reviews").select("connector_id,connection_name")
      .in("connector_id", [...personalIds]).eq("status", "isolated")
    : { data: [], error: null };
  if (reviewResult.error) throw new Error("No se pudo consultar el estado de las conexiones.");
  const isolated = new Set((reviewResult.data ?? []).map((row) => `${row.connector_id}\u0000${row.connection_name}`));
  const latestByConnector = new Map(inventories.map((row) => [row.connector_id, row.observed_at]));
  async function receivedSample(physicalId: string, connectionName: string, accountName: string) {
    const { data, error } = await service.from("ninja_event_receipts").select("payload")
      .eq("physical_connector_id", physicalId).eq("payload->>kind", "balance")
      .eq("payload->>connectionName", connectionName).eq("payload->>accountName", accountName)
      .in("status", ["pending", "persisted"]).order("payload->>occurredAt", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("No se pudo recuperar la observación broker.");
    if (!data) return null;
    const batch = { kind: "trade_telemetry_batch", batchId: "claim-read", observedAt: new Date().toISOString(), events: [data.payload] };
    return isNinjaTradeTelemetryBatch(batch) && batch.events[0].kind === "balance" ? batch.events[0] as NinjaBalanceTelemetryEvent : null;
  }
  const ownedKeys = new Set((ownershipResult.data ?? []).map((row) => `${row.physical_connector_id}\u0000${row.connection_name}\u0000${row.account_name}`));
  const pendingAccounts: PendingOpeningBrokerAccount[] = [];
  for (const row of pendingResult.data ?? []) {
    if (!personalIds.has(row.proposed_destination_connector_id)
      || isolated.has(`${row.proposed_destination_connector_id}\u0000${row.connection_name}`)
      || ownedKeys.has(`${row.physical_connector_id}\u0000${row.connection_name}\u0000${row.account_name}`)) continue;
    // Older pending receipt retries could rewind the pending row. The lossless
    // transport ledger retains the actual latest observation.
    const sample = await receivedSample(row.physical_connector_id, row.connection_name, row.account_name);
    const sampleIsLatest = sample !== null && Date.parse(sample.occurredAt) >= Date.parse(row.last_observed_at);
    const observedAt = sampleIsLatest ? sample!.occurredAt : row.last_observed_at;
    const balance = sampleIsLatest ? (sample!.cashValue === null ? null : Math.round(sample!.cashValue * 100))
      : row.latest_balance_cents === null ? null : Number(row.latest_balance_cents);
    const latest = latestByConnector.get(row.proposed_destination_connector_id);
    // Old subaccounts from prior connections must not appear as current candidates.
    if (latest && Date.parse(latest) - Date.parse(observedAt) > 120_000) continue;
    pendingAccounts.push({ accountName: row.account_name, balanceInCents: balance,
      connectionName: row.connection_name, observedAt, physicalConnectorId: row.physical_connector_id });
  }
  const recoveryRows = (ownershipResult.data ?? []).filter((row) => personalIds.has(row.destination_connector_id)
    && !isolated.has(`${row.destination_connector_id}\u0000${row.connection_name}`)
    && (!latestByConnector.has(row.destination_connector_id)
      || Date.parse(latestByConnector.get(row.destination_connector_id)!) < Date.parse(row.claimed_at)));
  const observations: ClaimedBrokerObservation[] = [];
  if (recoveryRows.length) {
    for (const row of recoveryRows) {
      const sample = await receivedSample(row.physical_connector_id, row.connection_name, row.account_name);
      if (!sample) continue;
      observations.push({ claimedAt: row.claimed_at, latestInventoryAt: latestByConnector.get(row.destination_connector_id) ?? null,
        sample });
    }
  }
  return { liveBrokerBalance: buildBrokerBalanceAfterClaim(inventories, observations), pendingAccounts };
}
