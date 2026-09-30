"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import type {
  IdentityAccount,
  IdentitySummary,
} from "@/modules/identities/domain/identity-summary";

import {
  assignIdentityAccount,
  createIdentityDirectly,
  sendIdentityConnectorInstallation,
  unassignIdentityAccount,
} from "./identity-actions";
import { NinjaConnectorPanel, type NinjaConnectorStatus } from "./ninja-connector-panel";

type Props = Readonly<{
  accounts: IdentityAccount[];
  connectors: NinjaConnectorStatus[];
  identities: IdentitySummary[];
  workspaceId: string;
}>;

function money(cents: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(cents / 100);
}

function accountState(account: IdentityAccount) {
  if (account.state === "closed") return "Cerrada";
  if (account.state === "virgin") return "Virgen";
  return "Activa";
}

export function IdentitiesWorkspace({ accounts, connectors, identities, workspaceId }: Props) {
  const router = useRouter();
  const createFormRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const assignedIds = new Set(accounts.filter((account) => account.currentIdentityId).map((account) => account.id));
  const unassigned = accounts.filter((account) => !assignedIds.has(account.id));

  function run(action: () => Promise<{ message: string; ok: boolean }>) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(result.message);
        if (result.ok) router.refresh();
      } catch {
        setMessage("No se pudo completar la acción. Volvé a intentarlo.");
      }
    });
  }

  return (
    <section aria-labelledby="identities-title" className="identities-view" id="identidades">
      <div className="workspace-section-heading identities-heading">
        <h2 id="identities-title">Identidades</h2>
      </div>

      <form action={(formData) => run(async () => {
        const result = await createIdentityDirectly({
          email: String(formData.get("email") ?? ""),
          fullName: String(formData.get("full_name") ?? ""),
          workspaceId,
        });
        if (result.ok) createFormRef.current?.reset();
        return result;
      })} className="identity-create-form" ref={createFormRef}>
        <input aria-label="Nombre completo" autoComplete="name" maxLength={200} name="full_name" placeholder="Nombre completo" required />
        <input aria-label="Correo de la identidad" autoComplete="email" inputMode="email" maxLength={254} name="email" placeholder="correo@gmail.com" required type="email" />
        <button className="primary-action" disabled={pending} type="submit">{pending ? "Agregando…" : "Agregar"}</button>
      </form>
      {message && <p aria-live="polite" className="identity-message">{message}</p>}

      <div className="identity-section-title"><h3>Identidades</h3><span>{identities.length}</span></div>
      <div className="identity-list">
        {identities.map((identity) => {
          const connector = connectors.find((candidate) => candidate.identityId === identity.id) ?? null;
          const installation = identity.connectorInstallation;
          const installationAvailable = installation !== null && installation.status !== "failed";
          const liveAccounts = identity.accounts.filter((account) => account.state !== "closed").length;
          const closedAccounts = identity.accounts.filter((account) => account.state === "closed").length;
          return <details className="identity-card" key={identity.id}>
            <summary>
              <span><strong>{identity.firstName} {identity.lastName}</strong><small>{identity.contactEmail}</small></span>
              <span><small>Resultado</small><strong className={identity.resultTotalInCents < 0 ? "negative" : undefined}>{money(identity.resultTotalInCents)}</strong></span>
              <span><small>Cuentas</small><strong>{identity.accounts.length}</strong></span>
              <i aria-hidden="true" />
            </summary>
            <div className="identity-detail">
              <div className="identity-account-summary">
                <div><span>Resultado acumulado</span><strong className={identity.resultTotalInCents < 0 ? "negative" : undefined}>{money(identity.resultTotalInCents)}</strong></div>
                <div><span>Payouts</span><strong>{money(identity.payoutTotalInCents)}</strong></div>
                <div><span>Cuentas vivas</span><strong>{liveAccounts}</strong></div>
                <div><span>Cuentas cerradas</span><strong>{closedAccounts}</strong></div>
              </div>

              <div className="identity-connector-row">
                <span>
                  <small>NinjaTrader</small>
                  <strong>{connector?.isOnline
                    ? "Conectado"
                    : connector
                      ? "Sin señal"
                      : installation?.status === "downloaded" && installationAvailable
                        ? "Instalación descargada"
                        : installationAvailable
                          ? "Instalación enviada"
                          : "Sin vincular"}</strong>
                </span>
                <div className="identity-connector-actions">
                  {identity.onboardingStatus === "approved" && <NinjaConnectorPanel
                    compact
                    connector={connector}
                    pairingLabel="Generar código"
                    targetIdentityId={identity.id}
                  />}
                    <button
                      className="identity-installation-resend"
                      disabled={pending}
                      onClick={() => run(() => sendIdentityConnectorInstallation(identity.id))}
                      type="button"
                    >
                      {pending ? "Enviando…" : installationAvailable ? "Reenviar instalación" : "Enviar instalación"}
                    </button>
                </div>
              </div>

              <div className="identity-subsection-title"><strong>Cuentas</strong><span>{identity.accounts.length}</span></div>
              <div className="identity-assigned-accounts">
                {identity.accounts.length === 0 ? <p>Sin cuentas asignadas.</p> : identity.accounts.map((account) => (
                  <details className="identity-account-card" key={account.id}>
                    <summary>
                      <span><strong>{account.label}</strong><small>{accountState(account)}{account.phase ? ` · ${account.phase}` : ""}</small></span>
                      <span><small>Cash value</small><strong>{account.balanceInCents === null ? "—" : money(account.balanceInCents)}</strong></span>
                      <strong className={account.resultInCents < 0 ? "negative" : undefined}>{money(account.resultInCents)}</strong>
                      <i aria-hidden="true" />
                    </summary>
                    <div className="identity-account-detail">
                      <div className="identity-account-facts">
                        <span><small>Trades</small><strong>{account.tradeCount}</strong></span>
                        <span><small>Payouts</small><strong>{money(account.payoutInCents)}</strong></span>
                        <span><small>Resultado</small><strong className={account.resultInCents < 0 ? "negative" : undefined}>{money(account.resultInCents)}</strong></span>
                      </div>
                      {account.history.length > 0 && <div className="identity-account-history">
                        <div className="identity-account-history-head"><span>N°</span><span>Etapa</span><span>Prop</span><span>Broker</span><span>Acumulado</span><span>Concepto</span></div>
                        {account.history.map((row, index) => <div className="identity-account-history-row" key={`${row.concept}-${row.tradeNumber ?? 0}-${index}`}>
                          <span>{row.tradeNumber ?? "—"}</span>
                          <span>{row.phase}</span>
                          <span>{row.propResultInCents === null ? "—" : money(row.propResultInCents)}</span>
                          <span>{row.brokerResultInCents === null ? "—" : money(row.brokerResultInCents)}</span>
                          <strong>{money(row.accumulatedInCents)}</strong>
                          <span>{row.concept}</span>
                        </div>)}
                      </div>}
                      <button className="identity-unassign" disabled={pending} onClick={() => run(() => unassignIdentityAccount(identity.id, account.id))} type="button">Quitar asignación</button>
                    </div>
                  </details>
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
        })}
        {identities.length === 0 && <p className="identity-empty-row">Sin identidades aprobadas.</p>}
      </div>
    </section>
  );
}
