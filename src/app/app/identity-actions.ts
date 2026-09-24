"use server";

import { createHash, randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { prepareDirectIdentity } from "@/modules/identities/domain/direct-identity";

type ActionResult = Readonly<{ message: string; ok: boolean }>;

const DEFAULT_IDENTITY_AUTOMATION_URL =
  "https://script.google.com/macros/s/AKfycbzqwgrt7c92nQCA3wvMweEj4tVbQ7OzXsa5pqRNj8vNADtSTHDh_HOraHBuGMG8ioMQiQ/exec";
const DEFAULT_APP_URL = "https://nodal-app-preview.vercel.app";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

function applicationUrl() {
  const configured = process.env.NODAL_APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercelHost ? `https://${vercelHost}` : DEFAULT_APP_URL;
}

export async function sendIdentityConnectorInstallation(identityId: string): Promise<ActionResult> {
  if (!isUuid(identityId)) return { ok: false, message: "La identidad no es válida." };
  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: installationId, error } = await supabase.rpc("create_identity_connector_installation", {
    target_expires_at: expiresAt,
    target_identity_id: identityId,
    target_token_hash: tokenHash,
  });
  if (error || !installationId) {
    return { ok: false, message: "No se pudo preparar la instalación." };
  }

  const downloadUrl = new URL("/api/integrations/identity-connector/download", applicationUrl());
  downloadUrl.searchParams.set("installationId", installationId);
  downloadUrl.searchParams.set("token", token);

  const automationUrl = process.env.IDENTITY_ONBOARDING_AUTOMATION_URL ?? DEFAULT_IDENTITY_AUTOMATION_URL;
  try {
    const response = await fetch(automationUrl, {
      body: JSON.stringify({
        action: "send_connector_installation",
        downloadUrl: downloadUrl.toString(),
        installationId,
        token,
      }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) throw new Error(`Identity automation returned ${response.status}`);
    const result = await response.json() as { ok?: boolean };
    if (!result.ok) throw new Error("Identity automation rejected the installation");
  } catch (sendError) {
    console.error("Identity connector installation dispatch failed", sendError);
    await supabase.rpc("cancel_identity_connector_installation", { target_installation_id: installationId });
    return { ok: false, message: "No se pudo enviar el correo. Intentá nuevamente." };
  }

  revalidatePath("/app");
  return { ok: true, message: "Instalación enviada. El enlace vence en 24 horas." };
}

export async function createIdentityDirectly(input: Readonly<{
  email: string;
  fullName: string;
  workspaceId: string;
}>): Promise<ActionResult> {
  const identity = prepareDirectIdentity(input);
  if (!isUuid(input.workspaceId) || !identity) {
    return { ok: false, message: "Ingresá nombre completo y un correo válido." };
  }
  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };
  const { error } = await supabase.rpc("create_nodal_identity_direct", {
    target_email: identity.email,
    target_first_name: identity.firstName,
    target_last_name: identity.lastName,
    target_workspace_id: input.workspaceId,
  });
  if (error) {
    return {
      ok: false,
      message: error.message.includes("duplicate")
        ? "Ya existe una identidad con ese correo."
        : "No se pudo agregar la identidad.",
    };
  }
  revalidatePath("/app");
  return { ok: true, message: "Identidad agregada." };
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
