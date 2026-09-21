"use server";

import { createHash, randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

type ActionResult = Readonly<{ message: string; ok: boolean }>;

const DEFAULT_IDENTITY_AUTOMATION_URL =
  "https://script.google.com/macros/s/AKfycbzqwgrt7c92nQCA3wvMweEj4tVbQ7OzXsa5pqRNj8vNADtSTHDh_HOraHBuGMG8ioMQiQ/exec";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function sendIdentityOnboardingRequest(input: Readonly<{
  email: string;
  workspaceId: string;
}>): Promise<ActionResult> {
  const email = input.email.trim().toLowerCase();
  if (!isUuid(input.workspaceId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, message: "Ingresá un correo válido." };
  }
  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: requestId, error } = await supabase.rpc("create_identity_onboarding_request", {
    target_email: email,
    target_token_hash: tokenHash,
    target_workspace_id: input.workspaceId,
  });
  if (error || !requestId) {
    return { ok: false, message: error?.message.includes("already exists") ? "Ya existe una solicitud abierta para ese correo." : "No se pudo crear la solicitud." };
  }

  const automationUrl = process.env.IDENTITY_ONBOARDING_AUTOMATION_URL ?? DEFAULT_IDENTITY_AUTOMATION_URL;
  try {
    const response = await fetch(automationUrl, {
      body: JSON.stringify({ action: "send_invitation", requestId, token }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) throw new Error(`Identity automation returned ${response.status}`);
    const result = await response.json() as { ok?: boolean };
    if (!result.ok) throw new Error("Identity automation rejected the invitation");
  } catch (sendError) {
    console.error("Identity invitation dispatch failed", sendError);
    await supabase.rpc("cancel_identity_onboarding_request", { target_request_id: requestId });
    return { ok: false, message: "No se pudo enviar el correo. Intentá nuevamente." };
  }

  revalidatePath("/app");
  return { ok: true, message: "Solicitud enviada." };
}

export async function approveIdentityRequest(requestId: string): Promise<ActionResult> {
  if (!isUuid(requestId)) return { ok: false, message: "La solicitud no es válida." };
  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };
  const { error } = await supabase.rpc("approve_identity_onboarding_request", { target_request_id: requestId });
  if (error) return { ok: false, message: "No se pudo aprobar la solicitud." };
  revalidatePath("/app");
  return { ok: true, message: "Identidad aprobada." };
}

export async function rejectIdentityRequest(requestId: string): Promise<ActionResult> {
  if (!isUuid(requestId)) return { ok: false, message: "La solicitud no es válida." };
  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };
  const { error } = await supabase.rpc("reject_identity_onboarding_request", { target_request_id: requestId });
  if (error) return { ok: false, message: "No se pudo rechazar la solicitud." };
  revalidatePath("/app");
  return { ok: true, message: "Solicitud rechazada." };
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
