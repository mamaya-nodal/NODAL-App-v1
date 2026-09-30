import { createClient } from "@supabase/supabase-js";

import { classifyNinjaAccount } from "../domain/account-classification";
import type { NinjaAccountSnapshot, NinjaInventorySnapshot } from "../domain/ingestion-payload";
import { decideNinjaIntake, type NinjaIntakeEpoch } from "../domain/intake-routing";
import type { NinjaTradeTelemetryBatch, NinjaTradeTelemetryEvent } from "../domain/trade-telemetry";

type OwnershipRow = Readonly<{
  account_name: string;
  account_type: "broker" | "prop";
  connection_name: string;
  destination_connector_id: string;
  owner_user_id: string;
}>;

type EpochRow = Readonly<{
  destination_connector_id: string | null;
  effective_from: string;
  effective_until: string | null;
}>;

export type RoutedInventory = Readonly<{ destinationConnectorId: string; snapshot: NinjaInventorySnapshot }>;
export type RoutedTelemetry = Readonly<{ batch: NinjaTradeTelemetryBatch; destinationConnectorId: string }>;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
}

function accountKey(connectionName: string, accountName: string) {
  return `${connectionName}\u0000${accountName}`;
}

function telemetryAccount(event: NinjaTradeTelemetryEvent): NinjaAccountSnapshot {
  return {
    accountName: event.accountName,
    cashValue: event.kind === "balance" ? event.cashValue : null,
    connectionName: event.connectionName,
    connectionStatus: "Connected",
    netLiquidation: event.kind === "balance" ? event.netLiquidation : null,
    providerName: event.providerName,
    realizedProfitLoss: event.kind === "balance" ? event.realizedProfitLoss : null,
    totalCashBalance: event.kind === "balance" ? event.totalCashBalance : null,
    unrealizedProfitLoss: event.kind === "balance" ? event.unrealizedProfitLoss : null,
  };
}

async function routingState(physicalConnectorId: string) {
  const supabase = serviceClient();
  if (!supabase) return null;
  const [epochsResult, ownershipResult, destinationsResult] = await Promise.all([
    supabase.from("ninja_connector_route_epochs")
      .select("destination_connector_id,effective_from,effective_until")
      .eq("physical_connector_id", physicalConnectorId)
      .order("effective_from", { ascending: true }),
    supabase.from("ninja_account_ownership")
      .select("account_name,account_type,connection_name,destination_connector_id,owner_user_id")
      .eq("physical_connector_id", physicalConnectorId),
    supabase.from("ninja_connector_destinations")
      .select("destination_connector_id,destination_owner_user_id")
      .eq("physical_connector_id", physicalConnectorId),
  ]);
  if (epochsResult.error || ownershipResult.error || destinationsResult.error) return null;
  return {
    destinationOwners: new Map(destinationsResult.data.map((row) => [row.destination_connector_id, row.destination_owner_user_id])),
    ownership: new Map((ownershipResult.data as OwnershipRow[]).map((row) => [accountKey(row.connection_name, row.account_name), row])),
    rows: epochsResult.data as unknown as EpochRow[],
    supabase,
  };
}

function epochsAt(rows: readonly EpochRow[], owners: ReadonlyMap<string, string>, occurredAt: string): NinjaIntakeEpoch[] {
  const occurredAtMs = Date.parse(occurredAt);
  return rows
    .filter((row) => Date.parse(row.effective_from) <= occurredAtMs
      && (row.effective_until === null || Date.parse(row.effective_until) > occurredAtMs))
    .map((row) => ({
      destination: row.destination_connector_id && owners.has(row.destination_connector_id)
        ? { connectorId: row.destination_connector_id, ownerUserId: owners.get(row.destination_connector_id)! }
        : null,
      effectiveFrom: row.effective_from,
    }));
}

async function rememberUnclaimedBroker(args: Readonly<{
  account: NinjaAccountSnapshot;
  destinationConnectorId: string | null;
  observedAt: string;
  physicalConnectorId: string;
  supabase: NonNullable<ReturnType<typeof serviceClient>>;
}>) {
  const balance = args.account.cashValue ?? args.account.netLiquidation ?? args.account.totalCashBalance;
  await args.supabase.from("ninja_unclaimed_broker_accounts").upsert({
    account_name: args.account.accountName,
    connection_name: args.account.connectionName,
    first_observed_at: args.observedAt,
    last_observed_at: args.observedAt,
    latest_balance_cents: balance === null ? null : Math.round(balance * 100),
    physical_connector_id: args.physicalConnectorId,
    proposed_destination_connector_id: args.destinationConnectorId,
  }, { onConflict: "physical_connector_id,connection_name,account_name" });
}

export async function routeNinjaInventory(
  physicalConnectorId: string,
  snapshot: NinjaInventorySnapshot,
): Promise<readonly RoutedInventory[] | null> {
  const state = await routingState(physicalConnectorId);
  if (!state) return null;
  const grouped = new Map<string, NinjaAccountSnapshot[]>();
  const currentEpochs = epochsAt(state.rows, state.destinationOwners, snapshot.observedAt);
  const currentDestination = currentEpochs.at(-1)?.destination?.connectorId ?? null;
  if (currentDestination) grouped.set(currentDestination, []);
  for (const account of snapshot.accounts) {
    const classified = classifyNinjaAccount(account, snapshot.observedAt);
    if (classified.type === "simulator") continue;
    const ownership = state.ownership.get(accountKey(account.connectionName, account.accountName));
    const accountType = classified.type === "broker" ? "broker" : "prop";
    const decision = decideNinjaIntake({
      accountOwnerUserId: ownership?.owner_user_id ?? null,
      accountType,
      epochs: currentEpochs,
      occurredAt: snapshot.observedAt,
    });
    if (classified.type === "broker" && !ownership) {
      await rememberUnclaimedBroker({ account, destinationConnectorId: currentDestination,
        observedAt: snapshot.observedAt, physicalConnectorId, supabase: state.supabase });
      continue;
    }
    const destination = ownership?.destination_connector_id ?? (decision.kind === "route" ? decision.connectorId : null);
    if (!destination) continue;
    grouped.set(destination, [...(grouped.get(destination) ?? []), account]);
  }
  await Promise.all([...grouped.keys()].map((id) => state.supabase.from("ninja_connectors")
    .update({ last_seen_at: new Date().toISOString() }).eq("id", id)));
  return [...grouped].map(([destinationConnectorId, accounts]) => ({
    destinationConnectorId,
    snapshot: { ...snapshot, accounts, eventId: `${snapshot.eventId}:${destinationConnectorId}` },
  }));
}

export async function routeNinjaTelemetry(
  physicalConnectorId: string,
  batch: NinjaTradeTelemetryBatch,
): Promise<readonly RoutedTelemetry[] | null> {
  const state = await routingState(physicalConnectorId);
  if (!state) return null;
  const grouped = new Map<string, NinjaTradeTelemetryEvent[]>();
  for (const event of batch.events) {
    const account = telemetryAccount(event);
    const classified = classifyNinjaAccount(account, event.occurredAt);
    if (classified.type === "simulator") continue;
    const ownership = state.ownership.get(accountKey(event.connectionName, event.accountName));
    const epochs = epochsAt(state.rows, state.destinationOwners, event.occurredAt);
    const decision = decideNinjaIntake({
      accountOwnerUserId: ownership?.owner_user_id ?? null,
      accountType: classified.type === "broker" ? "broker" : "prop",
      epochs,
      occurredAt: event.occurredAt,
    });
    if (classified.type === "broker" && !ownership) {
      await rememberUnclaimedBroker({ account, destinationConnectorId: epochs.at(-1)?.destination?.connectorId ?? null,
        observedAt: event.occurredAt, physicalConnectorId, supabase: state.supabase });
      continue;
    }
    const destination = ownership?.destination_connector_id ?? (decision.kind === "route" ? decision.connectorId : null);
    if (!destination) continue;
    grouped.set(destination, [...(grouped.get(destination) ?? []), event]);
  }
  return [...grouped].map(([destinationConnectorId, events]) => ({
    destinationConnectorId,
    batch: { ...batch, batchId: `${batch.batchId}:${destinationConnectorId}`, events },
  }));
}
