"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ACCOUNT_PHASES,
  summarizeAccountActivity,
} from "@/modules/operations/domain/account-detail";
import {
  calculateAccountResult,
  type AccountPhaseWithdrawal,
} from "@/modules/operations/domain/account-phase-results";
import {
  entriesForAccount,
  summarizeBrokerEntries,
  type OperationRegisterEntry,
} from "@/modules/operations/domain/operation-register";

import {
  saveAccountPhaseWithdrawal,
  setAccountStateMode,
  type AccountStateMode,
} from "./account-actions";

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
  stateOrigin: AccountStateMode;
}>;

type OperationRegisterProps = Readonly<{
  accounts: RegisterAccount[];
  entries: OperationRegisterEntry[];
  periodId: string;
  withdrawals: AccountPhaseWithdrawal[];
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

const stateModeLabels: Record<AccountStateMode, string> = {
  automatic: "Automático",
  manual_closed: "Forzar Cuenta cerrada",
  manual_live: "Forzar Cuenta viva",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function withdrawalDraftsForAccount(
  withdrawals: AccountPhaseWithdrawal[],
  accountId: string | undefined,
): Record<string, string> {
  return Object.fromEntries(
    withdrawals
      .filter((withdrawal) => withdrawal.accountId === accountId)
      .map((withdrawal) => [
        withdrawal.phase,
        (withdrawal.totalWithdrawalInCents / 100).toFixed(2),
      ]),
  );
}

export function OperationRegister({
  accounts,
  entries,
  periodId,
  withdrawals,
}: OperationRegisterProps) {
  const router = useRouter();
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
  const [stateMode, setStateMode] = useState<AccountStateMode>(
    firstAccount?.stateOrigin ?? "automatic",
  );
  const [withdrawalDrafts, setWithdrawalDrafts] = useState<Record<string, string>>(
    () => withdrawalDraftsForAccount(withdrawals, firstAccount?.id),
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
  const visibleWithdrawals = withdrawals.filter(
    (withdrawal) => withdrawal.accountId === accountId,
  );
  const summary = summarizeBrokerEntries(visibleEntries);
  const activity = summarizeAccountActivity(visibleEntries);
  const calculated = calculateAccountResult(
    visibleEntries,
    visibleWithdrawals,
    selectedAccount?.stateOrigin,
  );
  const latestTotal = [...calculated.phaseResults]
    .reverse()
    .find((phase) => phase.totalGainInCents !== 0)?.totalGainInCents ?? 0;

  function changeCompany(nextCompanyId: string) {
    const nextAccount = orderedAccounts.find(
      (account) => account.companyId === nextCompanyId,
    );
    setCompanyId(nextCompanyId);
    selectAccount(nextAccount?.id ?? "");
  }

  function selectAccount(nextAccountId: string) {
    const nextAccount = orderedAccounts.find((account) => account.id === nextAccountId);
    setAccountId(nextAccountId);
    setStateMode(nextAccount?.stateOrigin ?? "automatic");
    setWithdrawalDrafts(withdrawalDraftsForAccount(withdrawals, nextAccountId));
    setFeedback(null);
  }

  async function applyStateMode() {
    if (!selectedAccount || isSaving) return;
    setIsSaving(true);
    const result = await setAccountStateMode({
      accountId: selectedAccount.id,
      mode: stateMode,
      periodId,
    });
    setIsSaving(false);
    setFeedback(result.message);
    if (result.ok) router.refresh();
  }

  async function saveWithdrawal(
    phase: Exclude<(typeof ACCOUNT_PHASES)[number], "Evaluacion">,
  ) {
    if (!selectedAccount || isSaving) return;
    setIsSaving(true);
    const result = await saveAccountPhaseWithdrawal({
      accountId: selectedAccount.id,
      amount: withdrawalDrafts[phase] ?? "0",
      periodId,
      phase,
    });
    setIsSaving(false);
    setFeedback(result.message);
    if (result.ok) router.refresh();
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
        <span className="read-only-badge">Cálculo automático</span>
      </div>

      <p className="context-note">
        Acá aparecen las entradas creadas al confirmar Control Diario. También podés
        informar el TOTAL RETIRO real de cada vuelta y, excepcionalmente, forzar
        el estado de una cuenta.
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
                onChange={(event) => selectAccount(event.target.value)}
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
            <>
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

              <div className="account-state-control">
                <div>
                  <strong>Estado de la cuenta</strong>
                  <p>
                    En Automático, la app usa los TOTAL GANANCIA. Forzar conserva
                    la excepción hasta que vuelvas a Automático.
                  </p>
                </div>
                <label className="form-field" htmlFor="account_state_mode">
                  <span>Modo</span>
                  <select
                    id="account_state_mode"
                    onChange={(event) => setStateMode(event.target.value as AccountStateMode)}
                    value={stateMode}
                  >
                    {(Object.keys(stateModeLabels) as AccountStateMode[]).map((mode) => (
                      <option key={mode} value={mode}>{stateModeLabels[mode]}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="secondary-action inline-action"
                  disabled={isSaving}
                  onClick={applyStateMode}
                  type="button"
                >
                  Aplicar estado
                </button>
              </div>
            </>
          )}

          <div className="register-summary" aria-label="Resumen de la cuenta">
            <div>
              <span>NETO BROKER +</span>
              <strong>{formatMoney(summary.positiveInCents)}</strong>
            </div>
            <div>
              <span>NETO BROKER −</span>
              <strong>{formatMoney(summary.negativeInCents)}</strong>
            </div>
            <div className="register-net">
              <span>Último TOTAL GANANCIA</span>
              <strong>{formatMoney(latestTotal)}</strong>
            </div>
          </div>
          <p className="register-scope-note">
            El resultado broker es {formatMoney(summary.netInCents)}. El TOTAL
            GANANCIA de cada fase incorpora el TOTAL RETIRO manual cuando existe.
          </p>

          <div className="phase-overview phase-total-overview" aria-label="Totales por fase">
            {calculated.phaseResults.map((phaseResult) => (
              <div
                className={
                  phaseResult.broker.entryCount > 0 || phaseResult.totalWithdrawalInCents > 0
                    ? "active"
                    : ""
                }
                key={phaseResult.phase}
              >
                <span>{phaseResult.phase}</span>
                <small>Broker: {formatMoney(phaseResult.broker.netInCents)}</small>
                {phaseResult.carryInCents > 0 && (
                  <small>Arrastre forzado: {formatMoney(phaseResult.carryInCents)}</small>
                )}
                {phaseResult.phase !== "Evaluacion" && (
                  <label className="phase-withdrawal-field">
                    <span>TOTAL RETIRO</span>
                    <input
                      inputMode="decimal"
                      min="0"
                      onChange={(event) => setWithdrawalDrafts((current) => ({
                        ...current,
                        [phaseResult.phase]: event.target.value,
                      }))}
                      placeholder="0"
                      step="0.01"
                      type="number"
                      value={withdrawalDrafts[phaseResult.phase] ?? ""}
                    />
                    <button
                      className="text-action"
                      disabled={isSaving}
                      onClick={() =>
                        saveWithdrawal(
                          phaseResult.phase as Exclude<
                            (typeof ACCOUNT_PHASES)[number],
                            "Evaluacion"
                          >,
                        )
                      }
                      type="button"
                    >
                      Guardar
                    </button>
                  </label>
                )}
                <strong>TOTAL GANANCIA {formatMoney(phaseResult.totalGainInCents)}</strong>
              </div>
            ))}
          </div>
          {feedback && <p className="register-feedback">{feedback}</p>}

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
                          <strong className={entry.destination === "NETO BROKER -" ? "negative" : ""}>
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
