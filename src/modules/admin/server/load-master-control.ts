import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { transmittedWithinLast24Hours } from "../domain/connector-activity";
import { requireNodalAdmin } from "./admin-access";
import { loadDesks } from "./load-desks";

type UnitRow = Readonly<{
  agreement_bps: number;
  code: string;
  id: string;
  name: string;
  ordinal: number;
  responsible_email: string;
  responsible_name: string;
  root_desk_id: string;
}>;

export type MasterUnitSummary = Readonly<{
  deskCount: number;
  gross: number;
  id: string;
  nodalIncome: number;
  userCount: number;
}>;

export async function loadMasterControl(
  requestedMonth?: string,
) {
  const [deskData, adminDb] = await Promise.all([
    loadDesks("real", requestedMonth),
    requireNodalAdmin(),
  ]);
  const { data: claimsData } = await adminDb.auth.getClaims();
  const db = createServiceClient();
  const userIds = deskData.overview.people.map((person) => person.id);
  const [unitsResult, profilesResult, identifiersResult, workspacesResult, connectorsResult] = await Promise.all([
    db.from("nodal_units").select("id,ordinal,name,code,root_desk_id,responsible_name,responsible_email,agreement_bps").order("ordinal"),
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

  const identifierHistoryByUser: Record<string, typeof identifiersResult.data> = {};
  for (const identifier of identifiersResult.data ?? []) {
    identifierHistoryByUser[identifier.user_id] = [
      ...(identifierHistoryByUser[identifier.user_id] ?? []),
      identifier,
    ];
  }

  const units = (unitsResult.data ?? []) as UnitRow[];
  const deskById = new Map(deskData.overview.desks.map((desk) => [desk.id, desk]));
  const unitByDesk: Record<string, string> = {};
  const resolveUnitId = (deskId: string) => {
    if (unitByDesk[deskId]) return unitByDesk[deskId];
    const visited = new Set<string>();
    let currentId: string | null = deskId;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const unit = units.find((candidate) => candidate.root_desk_id === currentId);
      if (unit) {
        for (const id of visited) unitByDesk[id] = unit.id;
        return unit.id;
      }
      currentId = deskById.get(currentId)?.parent_id ?? null;
    }
    return units[0]?.id ?? "";
  };
  for (const desk of deskData.overview.desks) resolveUnitId(desk.id);
  const unitByUser = Object.fromEntries(deskData.overview.people.map((person) => [
    person.id,
    resolveUnitId(person.deskId),
  ]));
  const unitSummaries: MasterUnitSummary[] = units.map((unit) => {
    const people = deskData.overview.people.filter((person) => unitByUser[person.id] === unit.id);
    const desks = deskData.overview.desks.filter((desk) => resolveUnitId(desk.id) === unit.id && desk.terms.active);
    const root = desks.find((desk) => desk.id === unit.root_desk_id);
    return {
      deskCount: desks.length,
      gross: people.reduce((sum, person) => sum + person.gross, 0),
      id: unit.id,
      nodalIncome: root?.nodalShare ?? 0,
      userCount: people.filter((person) => person.access === "active").length,
    };
  });

  return {
    ...deskData,
    actorUserId: claimsData?.claims.sub ?? null,
    demo: false,
    connectorByUser,
    identitiesByUser,
    identifiersByUser: Object.fromEntries((identifiersResult.data ?? [])
      .filter((identifier) => identifier.valid_to === null)
      .map((identifier) => [identifier.user_id, identifier.display_id])),
    identifierHistoryByUser,
    profilesByUser: Object.fromEntries((profilesResult.data ?? []).map((profile) => [profile.id, profile])),
    unitByDesk,
    unitByUser,
    unitSummaries,
    units,
  };
}

export type MasterControlData = Awaited<ReturnType<typeof loadMasterControl>>;
