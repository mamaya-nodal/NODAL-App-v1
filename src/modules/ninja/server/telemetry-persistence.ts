import { createClient } from "@supabase/supabase-js";

import type { NinjaTradeTelemetryBatch } from "../domain/trade-telemetry";

export type TelemetryPersistenceResult =
  | Readonly<{ acceptedEvents: number; persisted: true }>
  | Readonly<{ acceptedEvents: 0; persisted: false; reason: "not_configured" | "storage_error" }>;

export async function persistNinjaTradeTelemetry(
  connectorId: string,
  batch: NinjaTradeTelemetryBatch,
): Promise<TelemetryPersistenceResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return { acceptedEvents: 0, persisted: false, reason: "not_configured" };

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const rows = batch.events.map((event) => ({
    account_name: event.accountName,
    connection_name: event.connectionName,
    connector_id: connectorId,
    event_id: event.eventId,
    event_type: event.kind,
    instrument: event.kind === "balance" ? null : event.instrument,
    occurred_at: event.occurredAt,
    payload: event,
  }));
  const { error } = await supabase
    .from("ninja_trade_telemetry_events")
    .upsert(rows, { ignoreDuplicates: true, onConflict: "connector_id,event_id" });

  return error
    ? { acceptedEvents: 0, persisted: false, reason: "storage_error" }
    : { acceptedEvents: rows.length, persisted: true };
}

