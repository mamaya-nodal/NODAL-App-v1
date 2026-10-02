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
  externalName: string | null;
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
  embedded?: boolean;
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
  embedded = false,
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
  const [accountId, setAccountId] = useState(firstAccount?.id ?? "");
  const [stateMode, setStateMode] = useState<AccountStateMode>(
    firstAccount?.stateOrigin ?? "automatic",
  );
  const [withdrawalDrafts, setWithdrawalDrafts] = useState<Record<string, string>>(
    () => withdrawalDraftsForAccount(withdrawals, firstAccount?.id),
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedAccount = orderedAccounts.find((account) => account.id === accountId);
  const visibleEntries = entriesForAccount(entries, accountId);
  const visibleWithdrawals = withdrawals.filter(
    (withdrawal) => withdrawal.accountId === accountId,
  );
  const activity = summarizeAccountActivity(visibleEntries);
  const calculated = calculateAccountResult(
    visibleEntries,
    visibleWithdrawals,
    selectedAccount?.stateOrigin,
    selectedAccount?.priceInCents ?? 0,
  );
  const summary = calculated.phaseResults.reduce(
    (total, phase) => ({
      entryCount: total.entryCount + phase.broker.entryCount,
      negativeInCents: total.negativeInCents + phase.broker.negativeInCents,
      netInCents: total.netInCents + phase.broker.netInCents,
      positiveInCents: total.positiveInCents + phase.broker.positiveInCents,
    }),
    { entryCount: 0, negativeInCents: 0, netInCents: 0, positiveInCents: 0 },
  );
  const latestTotal = [...calculated.phaseResults]
    .reverse()
    .find((phase) => phase.totalGainInCents !== 0)?.totalGainInCents ?? 0;
  const hasVisibleRegisterRows =
    visibleEntries.length > 0 || (selectedAccount?.priceInCents ?? 0) > 0;

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
      aria-label={embedded ? "Resultados por cuenta" : undefined}
      aria-labelledby={embedded ? undefined : "operation-register-title"}
      className="operation-register-panel"
      id="registro"
    >
      {embedded ? (
        <div className="embedded-section-heading"><h3>Detalle de cuenta</h3></div>
      ) : (
        <div className="register-heading">
          <h2 id="operation-register-title">Registro</h2>
        </div>
      )}

      {orderedAccounts.length === 0 ? (
        <p className="empty-state">
          Primero registrá una compra para disponer de una cuenta.
        </p>
      ) : (
        <>
          <div className="register-filters">
            <div className="form-field">
              <label htmlFor="register_account">Cuenta</label>
              <select
                id="register_account"
                onChange={(event) => selectAccount(event.target.value)}
                value={accountId}
              >
                {orderedAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.companyName} · {account.externalName ?? `Cuenta ${account.referenceNumber}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="register-account-title">
            <div>
              <strong>
                {selectedAccount?.companyName} · {selectedAccount?.externalName ?? `Cuenta ${selectedAccount?.referenceNumber}`}
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

              <details className="accounting-exception account-state-exception">
                <summary>Ajustes de cuenta</summary>
                <div className="account-state-control">
                  <label className="form-field" htmlFor="account_state_mode">
                    <span>Estado contable</span>
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
                    Aplicar
                  </button>
                </div>
              </details>
            </>
          )}

          <div className="register-summary" aria-label="Resumen de la cuenta">
            <div className="register-net">
              <span>Resultado</span>
              <strong>{formatMoney(latestTotal)}</strong>
            </div>
            <div>
              <span>Resultado positivo</span>
              <strong>{formatMoney(summary.positiveInCents)}</strong>
            </div>
            <div>
              <span>Resultado negativo</span>
              <strong>{formatMoney(summary.negativeInCents)}</strong>
            </div>
          </div>

          <div className="phase-overview phase-total-overview" aria-label="Totales por fase">
            {calculated.phaseResults
              .filter((phaseResult) =>
                phaseResult.broker.entryCount > 0 ||
                phaseResult.totalWithdrawalInCents > 0 ||
                (phaseResult.phase === "Evaluacion" && (selectedAccount?.priceInCents ?? 0) > 0),
              )
              .map((phaseResult) => (
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
                {phaseResult.carryInCents !== 0 && (
                  <small>
                    {phaseResult.carryInCents < 0 ? "Anterior" : "Arrastre forzado"}: {formatMoney(phaseResult.carryInCents)}
                  </small>
                )}
                {phaseResult.phase !== "Evaluacion" && (phaseResult.broker.entryCount > 0 || phaseResult.totalWithdrawalInCents > 0) && (
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

          {!hasVisibleRegisterRows ? (
            <p className="empty-state register-empty">
              Esta cuenta todavía no tiene operaciones registradas.
            </p>
          ) : (
            <div className="phase-register-list">
              {ACCOUNT_PHASES.map((phase) => {
                const phaseEntries = visibleEntries.filter(
                  (entry) => entry.phase === phase,
                );
                const purchasePriceInCents =
                  phase === "Evaluacion" ? selectedAccount?.priceInCents ?? 0 : 0;
                if (phaseEntries.length === 0 && purchasePriceInCents === 0) return null;

                return (
                  <section className="phase-register" key={phase}>
                    <div className="phase-register-heading">
                      <h3>{phase}</h3>
                      <span>
                        {phaseEntries.length + (purchasePriceInCents > 0 ? 1 : 0)}{" "}
                        {phaseEntries.length + (purchasePriceInCents > 0 ? 1 : 0) === 1
                          ? "entrada"
                          : "entradas"}
                      </span>
                    </div>
                    {purchasePriceInCents > 0 ? (
                      <article className="register-entry register-purchase-entry">
                        <div>
                          <strong>
                            {selectedAccount?.purchasedOn
                              ? formatDate(selectedAccount.purchasedOn)
                              : "Compra"}
                          </strong>
                          <span>Costo inicial de la cuenta</span>
                        </div>
                        <div className="register-entry-value">
                          <span>Costo</span>
                          <strong className="negative">{formatMoney(purchasePriceInCents)}</strong>
                        </div>
                      </article>
                    ) : null}
                    {phaseEntries.map((entry) => (
                      <article className="register-entry" key={entry.id}>
                        <div>
                          <strong>{formatDate(entry.operatedOn)}</strong>
                          <span>
                            {entry.participantRole === "leader" ? "Líder" : "Réplica"}
                            {" · "}Registrado automáticamente
                          </span>
                        </div>
                        <div className="register-entry-value">
                          <span>
                            {entry.destination === "NONE"
                              ? "Sin resultado broker"
                              : entry.destination === "NETO BROKER +"
                                ? "Resultado positivo"
                                : "Resultado negativo"}
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
