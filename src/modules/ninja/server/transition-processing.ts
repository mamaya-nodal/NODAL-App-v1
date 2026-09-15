import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { classifyNinjaAccount } from "../domain/account-classification";
import { isolatedNinjaConnectionNames, isNinjaConnectionActive } from "../domain/connection-access";
import type { NinjaInventorySnapshot } from "../domain/ingestion-payload";
import { isNinjaInventorySnapshot } from "../domain/ingestion-payload";
import { resolveNinjaReferenceBalance } from "../domain/reference-balance";
import { evolveNinjaTransitionState, type NinjaTransitionObservation, type NinjaTransitionState } from "../domain/transition-state";
import type { NinjaTechnicalOperation } from "../domain/technical-operation";

export type TransitionProcessingResult = Readonly<{
  detectedChanges: number;
  processed: boolean;
  reason?: "not_configured" | "storage_error";
}>;

function businessDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(isoDate));
}

function validState(value: unknown): NinjaTransitionState {
  if (!value || typeof value !== "object" || !Array.isArray((value as { lives?: unknown }).lives)) return { lives: [] };
  const state = value as NinjaTransitionState;
  return {
    lives: state.lives.map((life) => ({
      ...life,
      tracked: {
        ...life.tracked,
        // Los estados anteriores a APP-092 pertenecen al único alcance que
        // estaba aprobado entonces: programas de USD 50.000.
        accountSizeInCents: life.tracked.accountSizeInCents ?? 5_000_000,
      },
    })),
  };
}

export async function processNinjaTransitions(connectorId: string, snapshot: NinjaInventorySnapshot): Promise<TransitionProcessingResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return { detectedChanges: 0, processed: false, reason: "not_configured" };
  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const [{ data: reviewRows, error: reviewError }, { data: storedState, error: stateError }] = await Promise.all([
    supabase.from("ninja_connector_connection_reviews").select("connection_name,status").eq("connector_id", connectorId).eq("status", "isolated"),
    supabase.from("ninja_transition_states").select("revision, state").eq("connector_id", connectorId).maybeSingle(),
  ]);
  if (reviewError || stateError) return { detectedChanges: 0, processed: false, reason: "storage_error" };

  const isolated = isolatedNinjaConnectionNames(reviewRows ?? []);
  const connectedNames = [...new Set(snapshot.accounts
    .filter((account) => isNinjaConnectionActive(account.connectionName, isolated) && account.connectionStatus.toLowerCase() === "connected")
    .map((account) => account.connectionName))];
  const observations: NinjaTransitionObservation[] = snapshot.accounts.flatMap((account) => {
    if (!connectedNames.includes(account.connectionName)) return [];
    const classified = classifyNinjaAccount(account, snapshot.observedAt);
    if (classified.type !== "prop" || !classified.companyCode || !classified.phase || classified.accountSizeInCents === null) return [];
    const balance = resolveNinjaReferenceBalance(account);
    return [{
      balanceInCents: balance.balanceInCents ?? 0,
      balanceStatus: balance.status,
      accountSizeInCents: classified.accountSizeInCents,
      companyCode: classified.companyCode,
      connectionName: account.connectionName,
      externalAccountName: account.accountName,
      phase: classified.phase,
      product: classified.product,
    }];
  });

  const revision = Number(storedState?.revision ?? 0);
  const evolved = evolveNinjaTransitionState({
    businessDate: businessDate(snapshot.observedAt),
    connectedNames,
    createLifeId: randomUUID,
    observations,
    state: validState(storedState?.state),
  });
  const events = evolved.changes.map((change) => ({ ...change, occurredAt: snapshot.observedAt, sourceEventId: snapshot.eventId }));
  const { data: committed, error: commitError } = await supabase.rpc("commit_ninja_transition_state", {
    expected_revision: revision,
    target_connector_id: connectorId,
    target_events: events,
    target_state: evolved.state,
  });
  return commitError || committed !== true
    ? { detectedChanges: 0, processed: false, reason: "storage_error" }
    : { detectedChanges: events.length, processed: true };
}

export async function bootstrapNinjaTransitions(connectorId: string): Promise<TransitionProcessingResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return { detectedChanges: 0, processed: false, reason: "not_configured" };
  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: existing, error: stateError } = await supabase.from("ninja_transition_states").select("connector_id").eq("connector_id", connectorId).maybeSingle();
  if (stateError) return { detectedChanges: 0, processed: false, reason: "storage_error" };
  if (existing) return { detectedChanges: 0, processed: true };

  const { data: latest, error: snapshotError } = await supabase
    .from("ninja_inventory_snapshots")
    .select("event_id, observed_at, accounts")
    .eq("connector_id", connectorId)
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (snapshotError) return { detectedChanges: 0, processed: false, reason: "storage_error" };
  if (!latest) return { detectedChanges: 0, processed: true };
  const snapshot = { accounts: latest.accounts, eventId: latest.event_id, kind: "inventory_snapshot", observedAt: latest.observed_at };
  return isNinjaInventorySnapshot(snapshot)
    ? processNinjaTransitions(connectorId, snapshot)
    : { detectedChanges: 0, processed: false, reason: "storage_error" };
}

export async function refreshNinjaTransitionsFromLatestSnapshot(
  connectorId: string,
): Promise<TransitionProcessingResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return { detectedChanges: 0, processed: false, reason: "not_configured" };
  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: latest, error } = await supabase
    .from("ninja_inventory_snapshots")
    .select("event_id, observed_at, accounts")
    .eq("connector_id", connectorId)
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { detectedChanges: 0, processed: false, reason: "storage_error" };
  if (!latest) return { detectedChanges: 0, processed: true };
  const snapshot = { accounts: latest.accounts, eventId: latest.event_id, kind: "inventory_snapshot", observedAt: latest.observed_at };
  return isNinjaInventorySnapshot(snapshot)
    ? processNinjaTransitions(connectorId, snapshot)
    : { detectedChanges: 0, processed: false, reason: "storage_error" };
}

export async function processNinjaOperationBurns(
  connectorId: string,
  operations: readonly NinjaTechnicalOperation[],
): Promise<TransitionProcessingResult> {
  const candidates = operations.filter((operation) =>
    operation.status === "closed" &&
    operation.minimumNetLiquidation !== null &&
    operation.minimumNetLiquidationAt !== null,
  );
  if (candidates.length === 0) return { detectedChanges: 0, processed: true };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return { detectedChanges: 0, processed: false, reason: "not_configured" };
  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: storedState, error } = await supabase
    .from("ninja_transition_states")
    .select("revision,state")
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error || !storedState) return { detectedChanges: 0, processed: false, reason: "storage_error" };

  const state = validState(storedState.state);
  const operationByAccount = new Map(candidates.map((operation) => [
    `${operation.connectionName}\u0000${operation.accountName}`,
    operation,
  ]));
  const events: Array<Record<string, unknown>> = [];
  const lives = state.lives.map((life) => {
    if (life.status !== "active") return life;
    const operation = operationByAccount.get(`${life.connectionName}\u0000${life.tracked.externalAccountName}`);
    if (!operation || operation.minimumNetLiquidation === null || operation.minimumNetLiquidationAt === null) return life;
    const minimumInCents = Math.round(operation.minimumNetLiquidation * 100);
    if (minimumInCents > life.tracked.burnFloorInCents) return life;
    events.push({
      automatic: true,
      connectionName: life.connectionName,
      fromAccountName: life.tracked.externalAccountName,
      fromLifeId: life.lifeId,
      kind: "burned",
      occurredAt: operation.minimumNetLiquidationAt,
      reason: "Net Liquidation tocó el piso de quema vigente durante la operación.",
      sourceEventId: `ninja-operation-burn:${operation.openingEventId}`,
      toAccountName: null,
      toLifeId: null,
    });
    return {
      ...life,
      status: "burned" as const,
      tracked: { ...life.tracked, balanceInCents: minimumInCents },
    };
  });
  if (events.length === 0) return { detectedChanges: 0, processed: true };
  const { data: committed, error: commitError } = await supabase.rpc("commit_ninja_transition_state", {
    expected_revision: Number(storedState.revision),
    target_connector_id: connectorId,
    target_events: events,
    target_state: { lives },
  });
  return commitError || committed !== true
    ? { detectedChanges: 0, processed: false, reason: "storage_error" }
    : { detectedChanges: events.length, processed: true };
}
