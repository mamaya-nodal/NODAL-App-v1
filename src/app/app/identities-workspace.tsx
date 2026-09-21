"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type {
  CredentialsStatus,
  DocumentationStatus,
  IdentityAccount,
  IdentityStatus,
  IdentitySummary,
} from "@/modules/identities/domain/identity-summary";

import {
  assignIdentityAccount,
  createIdentity,
  unassignIdentityAccount,
  updateIdentityStatus,
} from "./identity-actions";

type Props = Readonly<{
  accounts: IdentityAccount[];
  identities: IdentitySummary[];
  workspaceId: string;
}>;

const onboardingLabels: Record<IdentityStatus, string> = {
  approved: "Aprobada",
  inactive: "Inactiva",
  invited: "Invitación enviada",
  received: "Pendiente de revisión",
};
const documentationLabels: Record<DocumentationStatus, string> = {
  complete: "Completa",
  pending: "Pendiente",
  received: "Recibida",
};
const credentialsLabels: Record<CredentialsStatus, string> = {
  complete: "Completas",
  pending: "Pendientes",
  update_required: "Requieren actualización",
};

function money(cents: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(cents / 100);
}
export function IdentitiesWorkspace({ accounts, identities, workspaceId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const assignedIds = new Set(accounts.filter((account) => account.currentIdentityId).map((account) => account.id));
  const unassigned = accounts.filter((account) => !assignedIds.has(account.id));
  const approved = identities.filter((identity) => identity.onboardingStatus === "approved").length;
  const awaiting = identities.filter((identity) => identity.onboardingStatus === "invited" || identity.onboardingStatus === "received").length;
  const payoutTotal = identities.reduce((total, identity) => total + identity.payoutTotalInCents, 0);

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
        <div><h2 id="identities-title">Identidades</h2><p>Personas, cuentas y resultados atribuidos de forma explícita.</p></div>
      </div>

      <div className="identity-kpis">
        <article><span>Activas</span><strong>{approved}</strong></article>
        <article><span>En onboarding</span><strong>{awaiting}</strong></article>
        <article><span>Cuentas asignadas</span><strong>{assignedIds.size}</strong></article>
        <article><span>Payouts atribuidos</span><strong>{money(payoutTotal)}</strong></article>
      </div>

      <div className="identity-safety-note">
        <strong>NODAL no solicita ni almacena contraseñas.</strong>
        <span>La documentación continúa ingresando mediante el formulario y queda resguardada en Drive.</span>
      </div>
      {message && <p aria-live="polite" className="identity-message">{message}</p>}

      <details className="identity-create-card">
        <summary><span>Agregar identidad</span><i aria-hidden="true" /></summary>
        <form action={(formData) => run(() => createIdentity({
          driveFolderUrl: String(formData.get("drive_folder_url") ?? ""),
          firstName: String(formData.get("first_name") ?? ""),
          lastName: String(formData.get("last_name") ?? ""),
          workspaceId,
        }))} className="identity-form">
          <label><span>Nombre</span><input autoComplete="off" maxLength={100} name="first_name" required /></label>
          <label><span>Apellido</span><input autoComplete="off" maxLength={100} name="last_name" required /></label>
          <label className="identity-drive-field"><span>Carpeta privada de Drive <small>opcional</small></span><input autoComplete="off" name="drive_folder_url" placeholder="https://drive.google.com/..." type="url" /></label>
          <button className="primary-action" disabled={pending} type="submit">{pending ? "Guardando…" : "Crear identidad"}</button>
        </form>
      </details>

      <div className="identity-list">
        {identities.map((identity) => {
          const availableAccounts = unassigned;
          return (
            <details className="identity-card" key={identity.id}>
              <summary>
                <span><strong>{identity.firstName} {identity.lastName}</strong><small>{onboardingLabels[identity.onboardingStatus]}</small></span>
                <span><small>Documentación</small><strong>{documentationLabels[identity.documentationStatus]}</strong></span>
                <span><small>Cuentas</small><strong>{identity.accounts.length}</strong></span>
                <span><small>Payouts</small><strong>{money(identity.payoutTotalInCents)}</strong></span>
                <i aria-hidden="true" />
              </summary>
              <div className="identity-detail">
                <form action={(formData) => run(() => updateIdentityStatus({
                  credentialsStatus: String(formData.get("credentials_status")) as CredentialsStatus,
                  documentationStatus: String(formData.get("documentation_status")) as DocumentationStatus,
                  driveFolderUrl: String(formData.get("drive_folder_url") ?? ""),
                  identityId: identity.id,
                  onboardingStatus: String(formData.get("onboarding_status")) as IdentityStatus,
                }))} className="identity-status-form">
                  <label><span>Onboarding</span><select defaultValue={identity.onboardingStatus} name="onboarding_status">{Object.entries(onboardingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label><span>Documentación</span><select defaultValue={identity.documentationStatus} name="documentation_status">{Object.entries(documentationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label><span>Credenciales operativas</span><select defaultValue={identity.credentialsStatus} name="credentials_status">{Object.entries(credentialsLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className="identity-drive-field"><span>Carpeta privada de Drive</span><input defaultValue={identity.driveFolderUrl ?? ""} name="drive_folder_url" placeholder="https://drive.google.com/..." type="url" /></label>
                  <button className="secondary-action" disabled={pending} type="submit">Guardar estado</button>
                </form>

                <div className="identity-account-summary">
                  <div><span>Resultado acumulado atribuido</span><strong className={identity.resultTotalInCents < 0 ? "negative" : undefined}>{money(identity.resultTotalInCents)}</strong></div>
                  <div><span>Payouts atribuidos</span><strong>{money(identity.payoutTotalInCents)}</strong></div>
                  {identity.driveFolderUrl && <a href={identity.driveFolderUrl} rel="noreferrer" target="_blank">Abrir documentación en Drive</a>}
                </div>

                <div className="identity-assigned-accounts">
                  <h3>Cuentas asignadas</h3>
                  {identity.accounts.length === 0 ? <p>Sin cuentas asignadas.</p> : identity.accounts.map((account) => (
                    <div key={account.id}>
                      <span><strong>{account.label}</strong><small>{account.state === "closed" ? "Cerrada" : account.state === "live" ? "Activa" : "Virgen"}</small></span>
                      <span>{money(account.payoutInCents)}</span>
                      <button disabled={pending} onClick={() => run(() => unassignIdentityAccount(identity.id, account.id))} type="button">Quitar</button>
                    </div>
                  ))}
                </div>

                {identity.onboardingStatus !== "inactive" && (
                  <form action={(formData) => run(() => assignIdentityAccount(identity.id, String(formData.get("account_id") ?? "")))} className="identity-assignment-form">
                    <label><span>Asignar una cuenta sin titular</span><select defaultValue="" name="account_id" required><option disabled value="">Elegí una cuenta</option>{availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.state === "closed" ? "Cerrada" : account.state === "live" ? "Activa" : "Virgen"}</option>)}</select></label>
                    <button className="primary-action" disabled={pending || availableAccounts.length === 0} type="submit">Asignar cuenta</button>
                  </form>
                )}
              </div>
            </details>
          );
        })}
        {identities.length === 0 && <div className="identity-empty"><strong>Todavía no hay identidades.</strong><span>Creá la primera cuando envíes su onboarding documental.</span></div>}
      </div>
    </section>
  );
}
