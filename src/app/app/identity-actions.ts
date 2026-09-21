"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type {
  CredentialsStatus,
  DocumentationStatus,
  IdentityStatus,
} from "@/modules/identities/domain/identity-summary";

type ActionResult = Readonly<{ message: string; ok: boolean }>;

const onboardingStatuses: readonly IdentityStatus[] = ["invited", "received", "approved", "inactive"];
const documentationStatuses: readonly DocumentationStatus[] = ["pending", "received", "complete"];
const credentialsStatuses: readonly CredentialsStatus[] = ["pending", "complete", "update_required"];

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function driveUrl(value: string) {
  const normalized = value.trim();
  return normalized === "" || /^https:\/\/drive\.google\.com\//i.test(normalized);
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createIdentity(input: Readonly<{
  driveFolderUrl: string;
  firstName: string;
  lastName: string;
  workspaceId: string;
}>): Promise<ActionResult> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!isUuid(input.workspaceId) || !firstName || !lastName || firstName.length > 100 || lastName.length > 100 || !driveUrl(input.driveFolderUrl)) {
    return { ok: false, message: "Revisá el nombre y el enlace privado de Drive." };
  }
  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };
  const { error } = await supabase.rpc("create_nodal_identity", {
    target_drive_folder_url: input.driveFolderUrl.trim() || null,
    target_first_name: firstName,
    target_last_name: lastName,
    target_workspace_id: input.workspaceId,
  });
  if (error) return { ok: false, message: "No se pudo crear la identidad." };
  revalidatePath("/app");
  return { ok: true, message: "Identidad creada. El onboarding quedó pendiente." };
}

export async function updateIdentityStatus(input: Readonly<{
  credentialsStatus: CredentialsStatus;
  documentationStatus: DocumentationStatus;
  driveFolderUrl: string;
  identityId: string;
  onboardingStatus: IdentityStatus;
}>): Promise<ActionResult> {
  if (!isUuid(input.identityId)
    || !onboardingStatuses.includes(input.onboardingStatus)
    || !documentationStatuses.includes(input.documentationStatus)
    || !credentialsStatuses.includes(input.credentialsStatus)
    || !driveUrl(input.driveFolderUrl)) {
    return { ok: false, message: "Los estados o el enlace de Drive no son válidos." };
  }
  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };
  const { error } = await supabase.rpc("update_nodal_identity_status", {
    target_credentials_status: input.credentialsStatus,
    target_documentation_status: input.documentationStatus,
    target_drive_folder_url: input.driveFolderUrl.trim() || null,
    target_identity_id: input.identityId,
    target_onboarding_status: input.onboardingStatus,
  });
  if (error) return { ok: false, message: "No se pudo actualizar la identidad." };
  revalidatePath("/app");
  return { ok: true, message: "Estado de la identidad actualizado." };
}

export async function assignIdentityAccount(identityId: string, accountId: string): Promise<ActionResult> {
  if (!isUuid(identityId) || !isUuid(accountId)) return { ok: false, message: "La identidad o la cuenta no son válidas." };
  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };
  const { error } = await supabase.rpc("assign_nodal_account_identity", {
    target_account_id: accountId,
    target_identity_id: identityId,
  });
  if (error) return { ok: false, message: error.message.includes("already assigned") ? "La cuenta ya pertenece a otra identidad." : "No se pudo asignar la cuenta." };
  revalidatePath("/app");
  return { ok: true, message: "Cuenta asignada explícitamente." };
}

export async function unassignIdentityAccount(identityId: string, accountId: string): Promise<ActionResult> {
  if (!isUuid(identityId) || !isUuid(accountId)) return { ok: false, message: "La identidad o la cuenta no son válidas." };
  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };
  const { error } = await supabase.rpc("unassign_nodal_account_identity", {
    target_account_id: accountId,
    target_identity_id: identityId,
    target_reason: "Corrección manual desde la aplicación",
  });
  if (error) return { ok: false, message: "No se pudo quitar la asignación." };
  revalidatePath("/app");
  return { ok: true, message: "Asignación retirada con trazabilidad." };
}
