"use server";

import { createHash, randomBytes } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { prepareSupportTicket } from "@/modules/support/domain/support-ticket";

export type SupportTicketState = Readonly<{
  message: string;
  status: "idle" | "error" | "success";
  ticketCode?: string;
}>;

export const initialSupportTicketState: SupportTicketState = { message: "", status: "idle" };

const DEFAULT_AUTOMATION_URL =
  "https://script.google.com/macros/s/AKfycbzqwgrt7c92nQCA3wvMweEj4tVbQ7OzXsa5pqRNj8vNADtSTHDh_HOraHBuGMG8ioMQiQ/exec";

export async function submitSupportTicket(
  _previous: SupportTicketState,
  formData: FormData,
): Promise<SupportTicketState> {
  const draft = prepareSupportTicket(Object.fromEntries(formData));
  if (!draft) {
    return { message: "Revisá la categoría, el asunto y la descripción.", status: "error" };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { message: "La sesión venció. Volvé a ingresar.", status: "error" };

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await supabase.rpc("create_support_ticket", {
    target_category: draft.category,
    target_description: draft.description,
    target_subject: draft.subject,
    target_token_hash: tokenHash,
  });
  const created = Array.isArray(data) ? data[0] as { ticket_code: string; ticket_id: string } | undefined : undefined;
  if (error || !created) {
    return {
      message: error?.message.includes("rate limit")
        ? "Alcanzaste el límite temporal de solicitudes. Intentá nuevamente más tarde."
        : "No pudimos crear el ticket. Intentá nuevamente.",
      status: "error",
    };
  }

  const automationUrl = process.env.SUPPORT_TICKET_AUTOMATION_URL
    ?? process.env.IDENTITY_ONBOARDING_AUTOMATION_URL
    ?? DEFAULT_AUTOMATION_URL;
  try {
    const response = await fetch(automationUrl, {
      body: JSON.stringify({ action: "send_support_ticket", ticketId: created.ticket_id, token }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const result = response.ok ? await response.json() as { ok?: boolean } : null;
    if (!response.ok || !result?.ok) throw new Error("Support automation rejected ticket");
  } catch (error) {
    console.error("Support ticket dispatch failed", error);
    await supabase.rpc("fail_support_ticket", { target_ticket_id: created.ticket_id });
    return { message: "El ticket no pudo enviarse. Intentá nuevamente.", status: "error" };
  }
  return {
    message: "Recibimos tu solicitud. Te responderemos por correo.",
    status: "success",
    ticketCode: created.ticket_code,
  };
}
