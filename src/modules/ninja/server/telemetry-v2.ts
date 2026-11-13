import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { isNinjaTradeTelemetryBatch, normalizeNinjaTradeTelemetryBatch, type NinjaTradeTelemetryEvent } from "../domain/trade-telemetry";
import { classifyNinjaAccount } from "../domain/account-classification";
import { routeNinjaTelemetry } from "./intake-routing";
import { refreshNinjaTechnicalOperations } from "./technical-operation-processing";
import { runObservedNinjaProcessing } from "./processing-observation";
import { persistAutomaticOperationBatches } from "./automatic-operation-processing";

export type ReceivedEvent = { payload: NinjaTradeTelemetryEvent; sha256: string };
export type EventReceipt = { eventId: string; sha256: string; status: "pending" | "persisted" | "excluded" | "conflict"; reason: string };

export function parseTelemetryV2(value: unknown): { batchId: string; events: ReceivedEvent[] } | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (body.protocol !== 2 || typeof body.batchId !== "string" || !/^[a-f0-9]{32}$/.test(body.batchId)
    || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 50) return null;
  const events: ReceivedEvent[] = [];
  const ids = new Set<string>();
  for (const envelope of body.events) {
    if (!envelope || typeof envelope.payload !== "string" || Buffer.byteLength(envelope.payload, "utf8") > 8192
      || typeof envelope.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(envelope.sha256)) return null;
    if (createHash("sha256").update(envelope.payload, "utf8").digest("hex") !== envelope.sha256) return null;
    let event: unknown;
    try { event = JSON.parse(envelope.payload); } catch { return null; }
    const batch = { batchId: body.batchId, kind: "trade_telemetry_batch", observedAt: "2000-01-01T00:00:00Z", events: [event] };
    if (!isNinjaTradeTelemetryBatch(batch)) return null;
    const normalized = normalizeNinjaTradeTelemetryBatch(batch).events[0];
    if (ids.has(normalized.eventId)) return null;
    ids.add(normalized.eventId);
    events.push({ payload: normalized, sha256: envelope.sha256 });
  }
  return { batchId: body.batchId, events };
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Intake unavailable");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function receiveTelemetryV2(physical: string, events: ReceivedEvent[]): Promise<EventReceipt[]> {
  const routed = await routeNinjaTelemetry(physical, {
    kind: "trade_telemetry_batch", batchId: randomUUID(), observedAt: new Date().toISOString(), events: events.map((e) => e.payload),
  });
  if (routed === null) throw new Error("Routing unavailable");
  const destinations = new Map<string, string>();
  for (const route of routed) for (const event of route.batch.events) {
    if (destinations.has(event.eventId)) throw new Error("Ambiguous route");
    destinations.set(event.eventId, route.destinationConnectorId);
  }
  const planned = events.map((event) => {
    const e = event.payload;
    const simulated = classifyNinjaAccount({
      accountName: e.accountName, connectionName: e.connectionName, providerName: e.providerName,
      connectionStatus: "Connected", cashValue: null, netLiquidation: null, totalCashBalance: null,
      realizedProfitLoss: null, unrealizedProfitLoss: null,
    }, e.occurredAt).type === "simulator";
    return { ...event, destinationConnectorId: destinations.get(e.eventId) ?? null, excluded: simulated ? "simulator" : null };
  });
  const { data, error } = await client().rpc("receive_ninja_telemetry_v2", { target_physical: physical, target_events: planned });
  if (error || !Array.isArray(data) || data.length !== events.length) {
    console.error("NODAL_NINJA_V2_STORAGE_FAILURE", { physicalConnectorId: physical, code: error?.code ?? "invalid_receipt_count" });
    throw new Error("Storage unavailable");
  }
  const expected = new Map(events.map((e) => [e.payload.eventId, e.sha256]));
  for (const r of data) {
    if (!r || expected.get(r.event_id) !== r.payload_hash || !expected.has(r.event_id)
      || !["pending", "persisted", "excluded", "conflict"].includes(r.status) || typeof r.reason !== "string") {
      throw new Error("Invalid storage receipt");
    }
    expected.delete(r.event_id);
  }
  return data.map((r) => ({ eventId: r.event_id, sha256: r.payload_hash, status: r.status, reason: r.reason }));
}

/** Durable retry source; after() is only an opportunity, never the queue itself. */
export async function drainTelemetryV2(physical: string) {
  const db = client();
  const { data: pending, error } = await db.from("ninja_event_receipts").select("payload,payload_hash")
    .eq("physical_connector_id", physical).eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(50);
  if (error) throw new Error("Pending read unavailable");
  if (pending?.length) await receiveTelemetryV2(physical, pending.map((r) => ({ payload: r.payload, sha256: r.payload_hash })));
  // Bounded work per heartbeat. Expired leases are recoverable after interruption.
  for (let i = 0; i < 4; i++) {
    const token = randomUUID();
    const { data: jobs, error: claimError } = await db.rpc("claim_ninja_rebuild_job", { target_physical: physical, target_token: token });
    if (claimError) throw new Error("Job claim unavailable");
    const job = jobs?.[0];
    if (!job) break;
    let nextReplaySince: string | null = null;
    const success = await runObservedNinjaProcessing(async () => {
      const result = await refreshNinjaTechnicalOperations(job.connector_id, {
        replaySince: job.replay_since ?? undefined,
      });
      if ("replayPending" in result && result.replayPending) {
        nextReplaySince = result.replaySince ?? job.replay_since;
        if (!nextReplaySince) throw new Error("Historical replay needs review");
      }
      // Prop events retain their identity destination. Reconsider its titular's
      // broker batches after those sessions have been rebuilt.
      const { data: source, error: sourceError } = await db.from("ninja_connectors")
        .select("owner_user_id").eq("id", job.connector_id).single();
      if (sourceError || !source) throw new Error("Rebuild owner unavailable");
      const { data: personal, error: personalError } = await db.from("ninja_connectors")
        .select("id").eq("owner_user_id", source.owner_user_id).is("identity_id", null).eq("status", "active");
      if (personalError) throw new Error("Broker destinations unavailable");
      for (const connector of personal ?? []) if (connector.id !== job.connector_id) {
        await persistAutomaticOperationBatches(connector.id);
      }
    });
    const { error: finishError } = await db.rpc("finish_ninja_rebuild_job_page", {
      target_connector: job.connector_id, target_token: token, target_revision: job.revision, target_success: success,
      target_replay_since: nextReplaySince,
    });
    if (finishError) throw new Error("Job completion unavailable");
  }
}

export async function safelyDrainTelemetryV2(physical: string) {
  try { await drainTelemetryV2(physical); }
  catch { console.error("NODAL_NINJA_V2_RETRY_PENDING", { physicalConnectorId: physical }); }
}
