"use server";

import { revalidatePath } from "next/cache";
import { loadMasterControl } from "@/modules/admin/server/load-master-control";
import { saveDeskUser } from "../mi-mesa/actions";

export async function saveMasterAssignments(input: Readonly<{
  userId: string;
  assignedUserIds: readonly string[];
}>) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!Array.isArray(input.assignedUserIds) || input.assignedUserIds.length > 250
    || input.assignedUserIds.some((id) => typeof id !== "string" || !uuid.test(id))) {
    return { ok: false, message: "La selección de usuarios no es válida." };
  }
  // Always load current terms under Admin Master authorization. The browser must
  // not overwrite percentages, roles or permissions from a historical view.
  const data = await loadMasterControl();
  const person = data.overview.people.find((candidate) => candidate.id === input.userId);
  const desk = data.overview.desks.find((candidate) => candidate.terms.active && candidate.terms.manager_id === input.userId);
  const profile = data.profilesByUser[input.userId];
  if (!person?.terms || !desk || !profile) {
    return { ok: false, message: "Primero guardá el rol Admin o Admin Master de este usuario." };
  }
  const state = person.terms.state;
  if (state !== "active" && state !== "paused") {
    return { ok: false, message: "El administrador debe estar activo para recibir usuarios." };
  }
  const result = await saveDeskUser({
    adminBps: desk.terms.nodal_bps,
    assignedUserIds: input.assignedUserIds,
    commissionBps: person.terms.commission_bps,
    contactEmail: profile.contact_email ?? profile.email,
    identitiesEnabled: profile.identities_enabled,
    dependencyDestinationDeskId: null,
    membershipDeskId: person.deskId,
    role: "admin",
    state,
    userId: person.id,
  });
  if (result.ok) revalidatePath("/app/admin");
  return result.ok ? { ok: true, message: "Usuarios a cargo actualizados." } : result;
}
