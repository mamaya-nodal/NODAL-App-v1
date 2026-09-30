import { createClient } from "@supabase/supabase-js";

import type { NinjaInventorySnapshot } from "../domain/ingestion-payload";
import { observedNinjaConnectionNames } from "../domain/connection-access";

export type SnapshotPersistenceResult =
  | Readonly<{ persisted: true }>
  | Readonly<{ persisted: false; reason: "not_configured" | "storage_error" }>;

export async function persistNinjaSnapshot(
  connectorId: string,
  snapshot: NinjaInventorySnapshot,
  physicalConnectorId = connectorId,
): Promise<SnapshotPersistenceResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return { persisted: false, reason: "not_configured" };

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.from("ninja_inventory_snapshots").upsert({
    account_count: snapshot.accounts.length,
    accounts: snapshot.accounts,
    connector_id: connectorId,
    event_id: snapshot.eventId,
    machine_id: null,
    observed_at: snapshot.observedAt,
    physical_connector_id: physicalConnectorId,
  }, { onConflict: "event_id", ignoreDuplicates: true });

  if (error) return { persisted: false, reason: "storage_error" };

  const connectionNames = observedNinjaConnectionNames(snapshot.accounts);
  if (!connectionNames.length) return { persisted: true };
  const { data: connector, error: connectorError } = await supabase
    .from("ninja_connectors")
    .select("owner_user_id")
    .eq("id", connectorId)
    .eq("status", "active")
    .maybeSingle();
  if (connectorError || !connector) return { persisted: false, reason: "storage_error" };

  // Compatibilidad con el esquema anterior a APP-097: una fila approved ya no
  // representa una aprobación humana por conexión. Se crea automáticamente
  // para que las funciones desplegadas previamente también incluyan conexiones
  // nuevas. ignoreDuplicates preserva cualquier aislamiento explícito.
  const { error: accessError } = await supabase
    .from("ninja_connector_connection_reviews")
    .upsert(connectionNames.map((connectionName) => ({
      connection_name: connectionName,
      connector_id: connectorId,
      reviewed_by: connector.owner_user_id,
      status: "approved",
    })), {
      ignoreDuplicates: true,
      onConflict: "connector_id,connection_name",
    });

  return accessError
    ? { persisted: false, reason: "storage_error" }
    : { persisted: true };
}
