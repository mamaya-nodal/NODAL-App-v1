import type { SupabaseClient } from "@supabase/supabase-js";

/** No fallback to connector_id: it identifies the accounting destination. */
export async function resolveTelemetryOrigins(
  db: SupabaseClient,
  events: readonly Readonly<{ id: number; physical_connector_id?: string | null }>[],
) {
  const origins = new Map(events.flatMap((event) => event.physical_connector_id
    ? [[Number(event.id), event.physical_connector_id] as const] : []));
  const unknown = events.filter((event) => !event.physical_connector_id).map((event) => Number(event.id));
  for (let offset = 0; offset < unknown.length; offset += 1000) {
    const { data, error } = await db.rpc("get_ninja_telemetry_origins", {
      target_event_ids: unknown.slice(offset, offset + 1000),
    });
    if (error) throw new Error("No se pudo verificar el origen físico de las ejecuciones.");
    for (const row of data ?? []) if (row.physical_connector_id) origins.set(Number(row.event_id), row.physical_connector_id);
  }
  return origins;
}
