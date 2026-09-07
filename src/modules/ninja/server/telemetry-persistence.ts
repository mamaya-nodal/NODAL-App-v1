import { createClient } from "@supabase/supabase-js";

import type { NinjaTradeTelemetryBatch } from "../domain/trade-telemetry";
import {
  collapseRepeatedBalanceTelemetry,
  storedTelemetryState,
  telemetryAccountKey,
  type PreviousTelemetryState,
} from "../domain/telemetry-dedupe";

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
  const accounts = new Map(batch.events.map((event) => [
    telemetryAccountKey(event.connectionName, event.accountName),
    { accountName: event.accountName, connectionName: event.connectionName },
  ]));
  const previousByAccount = new Map<string, PreviousTelemetryState>();
  try {
    await Promise.all([...accounts].map(async ([key, account]) => {
      const { data, error } = await supabase
        .from("ninja_trade_telemetry_events")
        .select("event_type,payload")
        .eq("connector_id", connectorId)
        .eq("connection_name", account.connectionName)
        .eq("account_name", account.accountName)
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;
      const state = storedTelemetryState(data.event_type, data.payload as Record<string, unknown>);
      if (state) previousByAccount.set(key, state);
    }));
  } catch {
    return { acceptedEvents: 0, persisted: false, reason: "storage_error" };
  }

  const events = collapseRepeatedBalanceTelemetry(batch.events, previousByAccount);
  if (events.length === 0) return { acceptedEvents: 0, persisted: true };

  const rows = events.map((event) => ({
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
