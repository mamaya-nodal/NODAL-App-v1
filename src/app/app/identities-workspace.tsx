"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type {
  IdentityAccount,
  IdentityOnboardingRequest,
  IdentitySummary,
} from "@/modules/identities/domain/identity-summary";

import {
  approveIdentityRequest,
  assignIdentityAccount,
  rejectIdentityRequest,
  sendIdentityOnboardingRequest,
  unassignIdentityAccount,
} from "./identity-actions";

type Props = Readonly<{
  accounts: IdentityAccount[];
  identities: IdentitySummary[];
  requests: IdentityOnboardingRequest[];
  workspaceId: string;
}>;

function money(cents: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(cents / 100);
}

export function IdentitiesWorkspace({ accounts, identities, requests, workspaceId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const assignedIds = new Set(accounts.filter((account) => account.currentIdentityId).map((account) => account.id));
  const unassigned = accounts.filter((account) => !assignedIds.has(account.id));
  const openRequests = requests.filter((request) => request.status === "sending" || request.status === "sent" || request.status === "submitted");

  function run(action: () => Promise<{ message: string; ok: boolean }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <section aria-labelledby="identities-title" className="identities-view" id="identidades">
      <div className="workspace-section-heading identities-heading">
        <h2 id="identities-title">Identidades</h2>
      </div>

      <form action={(formData) => run(() => sendIdentityOnboardingRequest({
        email: String(formData.get("email") ?? ""),
        workspaceId,
      }))} className="identity-invite-form">
        <input aria-label="Correo de la persona" autoComplete="email" inputMode="email" name="email" placeholder="correo@gmail.com" required type="email" />
        <button className="primary-action" disabled={pending} type="submit">{pending ? "Enviando…" : "Enviar solicitud"}</button>
      </form>
      {message && <p aria-live="polite" className="identity-message">{message}</p>}

      <div className="identity-section-title"><h3>Solicitudes</h3><span>{openRequests.length}</span></div>
      <div className="identity-request-list">
        {openRequests.map((request) => (
          <article className={`identity-request ${request.status}`} key={request.id}>
            <div>
              <strong>{request.status === "submitted" ? `${request.firstName} ${request.lastName}` : request.recipientEmail}</strong>
              {request.status === "submitted" && <span>{request.recipientEmail} · {request.phone}</span>}
            </div>
            <span className="identity-request-state">
              {request.status === "submitted" ? "Para aprobar" : request.status === "sent" ? "Enviada" : "Enviando"}
            </span>
            {request.status === "submitted" && (
              <div className="identity-request-actions">
                <button className="secondary-action" disabled={pending} onClick={() => run(() => rejectIdentityRequest(request.id))} type="button">Rechazar</button>
                <button className="primary-action" disabled={pending} onClick={() => run(() => approveIdentityRequest(request.id))} type="button">Aceptar</button>
              </div>
            )}
          </article>
        ))}
        {openRequests.length === 0 && <p className="identity-empty-row">Sin solicitudes pendientes.</p>}
      </div>

      <div className="identity-section-title"><h3>Identidades</h3><span>{identities.length}</span></div>
      <div className="identity-list">
        {identities.map((identity) => (
          <details className="identity-card" key={identity.id}>
            <summary>
              <span><strong>{identity.firstName} {identity.lastName}</strong><small>{identity.contactEmail}</small></span>
              <span><small>Cuentas</small><strong>{identity.accounts.length}</strong></span>
              <i aria-hidden="true" />
            </summary>
            <div className="identity-detail">
              <div className="identity-account-summary">
                <div><span>Resultado acumulado</span><strong className={identity.resultTotalInCents < 0 ? "negative" : undefined}>{money(identity.resultTotalInCents)}</strong></div>
                <div><span>Payouts</span><strong>{money(identity.payoutTotalInCents)}</strong></div>
              </div>

              <div className="identity-assigned-accounts">
                {identity.accounts.length === 0 ? <p>Sin cuentas asignadas.</p> : identity.accounts.map((account) => (
                  <div key={account.id}>
                    <span><strong>{account.label}</strong><small>{account.state === "closed" ? "Cerrada" : account.state === "live" ? "Activa" : "Virgen"}</small></span>
                    <span>{money(account.payoutInCents)}</span>
                    <button disabled={pending} onClick={() => run(() => unassignIdentityAccount(identity.id, account.id))} type="button">Quitar</button>
                  </div>
                ))}
              </div>

              <form action={(formData) => run(() => assignIdentityAccount(identity.id, String(formData.get("account_id") ?? "")))} className="identity-assignment-form">
                <select aria-label="Cuenta sin titular" defaultValue="" name="account_id" required>
                  <option disabled value="">Asignar cuenta</option>
                  {unassigned.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
                </select>
                <button className="primary-action" disabled={pending || unassigned.length === 0} type="submit">Asignar</button>
              </form>
            </div>
          </details>
        ))}
        {identities.length === 0 && <p className="identity-empty-row">Sin identidades aprobadas.</p>}
      </div>
    </section>
  );
}
