"use client";

import { useActionState } from "react";

import { SUPPORT_CATEGORIES } from "@/modules/support/domain/support-ticket";
import {
  initialSupportTicketState,
  submitSupportTicket,
} from "./support-ticket-actions";

export function SupportTicketForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(submitSupportTicket, initialSupportTicketState);
  if (state.status === "success") {
    return (
      <section className="support-ticket-success" role="status">
        <span>Ticket enviado</span>
        <strong>{state.ticketCode}</strong>
        <p>{state.message}</p>
        <a href="/app#inicio">Volver a NODAL</a>
      </section>
    );
  }
  return (
    <form action={formAction} className="support-ticket-form">
      <label>
        Correo de respuesta
        <input disabled value={email} />
      </label>
      <label>
        Categoría
        <select defaultValue="technical" name="category" required>
          {SUPPORT_CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>{category.label}</option>
          ))}
        </select>
      </label>
      <label className="support-ticket-wide">
        Asunto
        <input maxLength={120} minLength={5} name="subject" placeholder="Resumen del problema" required />
      </label>
      <label className="support-ticket-wide">
        Descripción
        <textarea maxLength={4000} minLength={20} name="description" placeholder="Contanos qué pasó y qué estabas intentando hacer." required rows={7} />
      </label>
      <p className="support-ticket-privacy">No incluyas contraseñas, claves privadas ni datos de tarjetas.</p>
      {state.status === "error" ? <p className="support-ticket-error" role="alert">{state.message}</p> : null}
      <button disabled={pending} type="submit">{pending ? "Enviando…" : "Enviar ticket"}</button>
    </form>
  );
}
