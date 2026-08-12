"use client";

import { useMemo, useState } from "react";

import {
  ACCOUNT_PHASES,
  summarizeAccountActivity,
  summarizeAccountPhases,
} from "@/modules/operations/domain/account-detail";
import {
  entriesForAccount,
  summarizeBrokerEntries,
  type OperationRegisterEntry,
} from "@/modules/operations/domain/operation-register";

export type RegisterAccount = Readonly<{
  companyId: string;
  companyName: string;
  fundsOrigin: string | null;
  id: string;
  priceInCents: number | null;
  purchaseNumber: number | null;
  purchasedOn: string | null;
  referenceNumber: number;
  state: "virgin" | "live" | "closed";
}>;

type OperationRegisterProps = Readonly<{
  accounts: RegisterAccount[];
  entries: OperationRegisterEntry[];
}>;

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    signDisplay: "auto",
    style: "currency",
  }).format(cents / 100);
}

const stateLabels: Record<RegisterAccount["state"], string> = {
  closed: "Cuenta cerrada",
  live: "Cuenta viva",
  virgin: "Cuenta virgen",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export function OperationRegister({ accounts, entries }: OperationRegisterProps) {
  const orderedAccounts = useMemo(
    () =>
      [...accounts].sort(
        (left, right) =>
          left.companyName.localeCompare(right.companyName) ||
          left.referenceNumber - right.referenceNumber,
      ),
    [accounts],
  );
  const firstAccount = orderedAccounts[0];
  const [companyId, setCompanyId] = useState(firstAccount?.companyId ?? "");
  const [accountId, setAccountId] = useState(firstAccount?.id ?? "");
  const companies = Array.from(
    new Map(
      orderedAccounts.map((account) => [
        account.companyId,
        { id: account.companyId, name: account.companyName },
      ]),
    ).values(),
  );
  const companyAccounts = orderedAccounts.filter(
    (account) => account.companyId === companyId,
  );
  const selectedAccount = orderedAccounts.find((account) => account.id === accountId);
  const visibleEntries = entriesForAccount(entries, accountId);
  const summary = summarizeBrokerEntries(visibleEntries);
  const activity = summarizeAccountActivity(visibleEntries);
  const phaseSummaries = summarizeAccountPhases(visibleEntries);

  function changeCompany(nextCompanyId: string) {
    const nextAccount = orderedAccounts.find(
      (account) => account.companyId === nextCompanyId,
    );
    setCompanyId(nextCompanyId);
    setAccountId(nextAccount?.id ?? "");
  }

  return (
    <section
      aria-labelledby="operation-register-title"
      className="operation-register-panel"
      id="registro"
    >
      <div className="register-heading">
        <div>
          <p className="status">REGISTRO DE OPERACIONES</p>
          <h2 id="operation-register-title">Revisar por cuenta</h2>
        </div>
        <span className="read-only-badge">Solo lectura</span>
      </div>

      <p className="context-note">
        Acá aparecen automáticamente las entradas creadas al confirmar Control
        Diario. No necesitás volver a cargarlas.
      </p>

      {orderedAccounts.length === 0 ? (
        <p className="empty-state">
          Primero registrá una compra para disponer de una cuenta.
        </p>
      ) : (
        <>
          <div className="register-filters">
            <div className="form-field">
              <label htmlFor="register_company">Empresa</label>
              <select
                id="register_company"
                onChange={(event) => changeCompany(event.target.value)}
                value={companyId}
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="register_account">Cuenta</label>
              <select
                id="register_account"
                onChange={(event) => setAccountId(event.target.value)}
                value={accountId}
              >
                {companyAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    Cuenta {account.referenceNumber}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="register-account-title">
            <div>
              <span>Cuenta seleccionada</span>
              <strong>
                {selectedAccount?.companyName} · Cuenta {selectedAccount?.referenceNumber}
              </strong>
            </div>
            <strong className={`account-state ${selectedAccount?.state ?? "virgin"}`}>
              {selectedAccount ? stateLabels[selectedAccount.state] : "Sin estado"}
            </strong>
          </div>

          {selectedAccount && (
            <div className="account-file" aria-label="Ficha de la cuenta">
              <div>
                <span>Compra</span>
                <strong>
                  {selectedAccount.purchaseNumber === null
                    ? "Sin compra vinculada"
                    : `N.º ${selectedAccount.purchaseNumber}`}
                </strong>
                <small>
                  {selectedAccount.purchasedOn
                    ? formatDate(selectedAccount.purchasedOn)
                    : "Fecha no disponible"}
                </small>
              </div>
              <div>
                <span>Precio</span>
                <strong>
                  {selectedAccount.priceInCents === null
                    ? "No disponible"
                    : formatMoney(selectedAccount.priceInCents)}
                </strong>
                <small>{selectedAccount.fundsOrigin ?? "Origen no disponible"}</small>
              </div>
              <div>
                <span>Fases con actividad</span>
                <strong>{activity.activePhaseCount} de 6</strong>
                <small>
                  {activity.lastOperatedOn
                    ? `Última: ${formatDate(activity.lastOperatedOn)}`
                    : "Todavía sin actividad"}
                </small>
              </div>
              <div>
                <span>Participación registrada</span>
                <strong>{visibleEntries.length} entradas</strong>
                <small>
                  {activity.leaderEntryCount} como líder · {activity.replicaEntryCount} como réplica
                </small>
              </div>
            </div>
          )}

          <div className="register-summary" aria-label="Resumen broker de la cuenta">
            <div>
              <span>NETO BROKER +</span>
              <strong>{formatMoney(summary.positiveInCents)}</strong>
            </div>
            <div>
              <span>NETO BROKER −</span>
              <strong>{formatMoney(summary.negativeInCents)}</strong>
            </div>
            <div className="register-net">
              <span>Resultado broker visible</span>
              <strong>{formatMoney(summary.netInCents)}</strong>
            </div>
          </div>
          <p className="register-scope-note">
            Este subtotal incluye solamente los resultados broker registrados; no
            representa todavía el resultado final de la cuenta.
          </p>

          <div className="phase-overview" aria-label="Estado de las fases">
            {phaseSummaries.map(({ broker, phase }) => (
              <div className={broker.entryCount > 0 ? "active" : ""} key={phase}>
                <span>{phase}</span>
                <strong>
                  {broker.entryCount > 0 ? formatMoney(broker.netInCents) : "Sin actividad"}
                </strong>
              </div>
            ))}
          </div>
          <p className="register-scope-note">
            Los valores por fase son subtotales broker visibles. No incluyen todavía
            TOTAL RETIRO ni se presentan como TOTAL GANANCIA.
          </p>

          {visibleEntries.length === 0 ? (
            <p className="empty-state register-empty">
              Esta cuenta todavía no tiene operaciones confirmadas desde Control Diario.
            </p>
          ) : (
            <div className="phase-register-list">
              {ACCOUNT_PHASES.map((phase) => {
                const phaseEntries = visibleEntries.filter(
                  (entry) => entry.phase === phase,
                );
                if (phaseEntries.length === 0) return null;

                return (
                  <section className="phase-register" key={phase}>
                    <div className="phase-register-heading">
                      <h3>{phase}</h3>
                      <span>
                        {phaseEntries.length}{" "}
                        {phaseEntries.length === 1 ? "entrada" : "entradas"}
                      </span>
                    </div>
                    {phaseEntries.map((entry) => (
                      <article className="register-entry" key={entry.id}>
                        <div>
                          <strong>{formatDate(entry.operatedOn)}</strong>
                          <span>
                            {entry.participantRole === "leader" ? "Líder" : "Réplica"}
                            {" · "}Generado desde Control Diario
                          </span>
                        </div>
                        <div className="register-entry-value">
                          <span>
                            {entry.destination === "NONE"
                              ? "Sin resultado broker"
                              : entry.destination}
                          </span>
                          <strong
                            className={
                              entry.destination === "NETO BROKER -" ? "negative" : ""
                            }
                          >
                            {formatMoney(entry.magnitudeInCents)}
                          </strong>
                        </div>
                      </article>
                    ))}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
