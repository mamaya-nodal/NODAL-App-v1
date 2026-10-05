import "server-only";

import { transmittedWithinLast24Hours } from "../domain/connector-activity";
import { requireNodalAdmin } from "./admin-access";
import { loadDesks } from "./load-desks";

type UnitRow = Readonly<{
  code: string;
  id: string;
  name: string;
  ordinal: number;
  root_desk_id: string;
}>;

export async function loadMasterControl(
  requestedMonth?: string,
) {
  const [deskData, db] = await Promise.all([
    loadDesks("real", requestedMonth),
    requireNodalAdmin(),
  ]);
  const userIds = deskData.overview.people.map((person) => person.id);
  const [unitsResult, profilesResult, identifiersResult, workspacesResult, connectorsResult] = await Promise.all([
    db.from("nodal_units").select("id,ordinal,name,code,root_desk_id").order("ordinal"),
    db.from("nodal_users")
      .select("id,email,contact_email,display_name,access_state,access_role,created_at,identities_enabled")
      .in("id", userIds),
    db.from("nodal_user_identifiers")
      .select("user_id,desk_id,display_id,valid_from,valid_to,reason")
      .in("user_id", userIds).order("valid_from", { ascending: false }),
    db.from("workspaces").select("id,owner_user_id").eq("modality", "real").in("owner_user_id", userIds),
    db.from("ninja_connectors")
      .select("owner_user_id,connector_version,last_seen_at")
      .in("owner_user_id", userIds).order("paired_at", { ascending: false }),
  ]);
  if (unitsResult.error || profilesResult.error || identifiersResult.error || workspacesResult.error || connectorsResult.error) {
    throw new Error("No se pudo cargar el panel de control Admin Master.");
  }

  const workspaceRows = workspacesResult.data ?? [];
  const workspaceOwner = new Map(workspaceRows.map((workspace) => [workspace.id, workspace.owner_user_id]));
  const workspaceIds = workspaceRows.map((workspace) => workspace.id);
  const identitiesResult = workspaceIds.length > 0
    ? await db.from("nodal_identities")
      .select("id,workspace_id,first_name,last_name,onboarding_status")
      .in("workspace_id", workspaceIds).order("created_at")
    : { data: [], error: null };
  if (identitiesResult.error) throw new Error("No se pudieron cargar las identidades del sistema.");

  const identitiesByUser: Record<string, Array<{
    id: string;
    name: string;
    state: string;
  }>> = {};
  for (const identity of identitiesResult.data ?? []) {
    const ownerId = workspaceOwner.get(identity.workspace_id);
    if (!ownerId) continue;
    identitiesByUser[ownerId] = [
      ...(identitiesByUser[ownerId] ?? []),
      {
        id: identity.id,
        name: `${identity.first_name} ${identity.last_name}`.trim(),
        state: identity.onboarding_status,
      },
    ];
  }

  const connectorByUser: Record<string, {
    active: boolean;
    lastSeenAt: string | null;
    version: string | null;
  }> = {};
  for (const connector of connectorsResult.data ?? []) {
    if (connectorByUser[connector.owner_user_id]) continue;
    connectorByUser[connector.owner_user_id] = {
      active: transmittedWithinLast24Hours(connector.last_seen_at),
      lastSeenAt: connector.last_seen_at,
      version: connector.connector_version || null,
    };
  }

  return {
    ...deskData,
    connectorByUser,
    identitiesByUser,
    identifiersByUser: Object.fromEntries((identifiersResult.data ?? [])
      .filter((identifier) => identifier.valid_to === null)
      .map((identifier) => [identifier.user_id, identifier.display_id])),
    identifierHistoryByUser: Object.groupBy(
      identifiersResult.data ?? [],
      (identifier) => identifier.user_id,
    ),
    profilesByUser: Object.fromEntries((profilesResult.data ?? []).map((profile) => [profile.id, profile])),
    units: (unitsResult.data ?? []) as UnitRow[],
  };
}

export type MasterControlData = Awaited<ReturnType<typeof loadMasterControl>>;
