"use server";

import { createHash, randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type DeskActionResult = Readonly<{ message: string; ok: boolean }>;

const DEFAULT_AUTOMATION_URL =
  "https://script.google.com/macros/s/AKfycbzqwgrt7c92nQCA3wvMweEj4tVbQ7OzXsa5pqRNj8vNADtSTHDh_HOraHBuGMG8ioMQiQ/exec";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function applicationUrl() {
  const configured = process.env.NODAL_APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return productionHost ? `https://${productionHost}` : "https://app.nodaltrading.com";
}

function mutationError(message: string): DeskActionResult {
  if (message.includes("PERCENTAGE_WINDOW_CLOSED")) {
    return { ok: false, message: "Los porcentajes sólo se pueden cambiar durante las 48 horas posteriores al cierre." };
  }
  if (message.includes("REASSIGN_SUBORDINATES_FIRST")) {
    return { ok: false, message: "Antes de quitar el rol Admin o dar la baja, reasigná todos sus usuarios y mesas dependientes." };
  }
  if (message.includes("NESTED_ADMIN_MOVE_FORBIDDEN")) {
    return { ok: false, message: "Ese usuario administra otra mesa. Primero debés resolver su estructura dependiente." };
  }
  if (message.includes("OUTSIDE_BRANCH") || message.includes("FORBIDDEN")) {
    return { ok: false, message: "No tenés permiso para modificar usuarios fuera de tu estructura." };
  }
  return { ok: false, message: "No se pudieron guardar los cambios. Revisá los datos e intentá nuevamente." };
}

export async function sendDeskUserInvitation(input: Readonly<{
  email: string;
  referredByUserId: string;
}>): Promise<DeskActionResult> {
  const email = input.email.trim().toLowerCase();
  if (!isUuid(input.referredByUserId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, message: "Ingresá un correo válido y elegí quién realiza la invitación." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: invitationId, error } = await supabase.rpc("create_nodal_user_invitation", {
    target_email: email,
    target_referred_by_user_id: input.referredByUserId,
    target_token_hash: tokenHash,
  });
  if (error || !invitationId) {
    return {
      ok: false,
      message: error?.message.includes("already") || error?.message.includes("duplicate")
        ? "Ya existe una invitación abierta para ese correo."
        : "No se pudo crear la invitación.",
    };
  }

  const automationUrl = process.env.USER_INVITATION_AUTOMATION_URL
    ?? process.env.IDENTITY_ONBOARDING_AUTOMATION_URL
    ?? DEFAULT_AUTOMATION_URL;
  try {
    const response = await fetch(automationUrl, {
      body: JSON.stringify({
        action: "send_nodal_user_invitation",
        appUrl: `${applicationUrl()}/`,
        invitationId,
        recipientEmail: email,
        token,
      }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const result = response.ok ? await response.json() as { ok?: boolean } : null;
    if (!response.ok || !result?.ok) throw new Error("Invitation automation rejected request");
    const { error: sentError } = await supabase.rpc("mark_nodal_user_invitation_sent", {
      target_invitation_id: invitationId,
    });
    if (sentError) throw sentError;
  } catch (sendError) {
    console.error("NODAL user invitation dispatch failed", sendError);
    await supabase.rpc("fail_nodal_user_invitation", { target_invitation_id: invitationId });
    return { ok: false, message: "La invitación se registró, pero el correo no pudo enviarse. Intentá nuevamente." };
  }

  revalidatePath("/app/mi-mesa");
  revalidatePath("/app/admin/users");
  return { ok: true, message: "Invitación enviada. Queda pendiente de aprobación de Admin Master." };
}

export async function saveDeskUser(input: Readonly<{
  adminBps: number | null;
  assignedUserIds: readonly string[];
  commissionBps: number | null;
  contactEmail: string;
  identitiesEnabled: boolean;
  role: "admin" | "student";
  state: "active" | "paused" | "inactive";
  userId: string;
}>): Promise<DeskActionResult> {
  if (!isUuid(input.userId)
    || input.assignedUserIds.length > 250
    || input.assignedUserIds.some((id) => !isUuid(id))
    || !Number.isInteger(input.commissionBps)
    || input.commissionBps === null
    || input.commissionBps < 0
    || input.commissionBps > 10_000
    || (input.role === "admin" && (!Number.isInteger(input.adminBps) || input.adminBps === null || input.adminBps < 0 || input.adminBps > 10_000))) {
    return { ok: false, message: "Revisá los porcentajes y la asignación de usuarios." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "La sesión venció. Volvé a ingresar." };
  const { error } = await supabase.rpc("desk_admin_save_user", {
    target_admin_bps: input.role === "admin" && input.state !== "inactive" ? input.adminBps : null,
    target_assigned_user_ids: [...new Set(input.assignedUserIds)],
    target_commission_bps: input.commissionBps,
    target_contact_email: input.contactEmail,
    target_identities_enabled: input.identitiesEnabled,
    target_is_admin: input.role === "admin" && input.state !== "inactive",
    target_state: input.state,
    target_user_id: input.userId,
  });
  if (error) return mutationError(error.message);
  revalidatePath("/app/mi-mesa");
  revalidatePath("/app/admin/desks");
  revalidatePath("/app/admin/users");
  return { ok: true, message: "Cambios guardados con trazabilidad." };
}
