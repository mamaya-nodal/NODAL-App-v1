"use client";

import { FormEvent, useState } from "react";

import {
  OPERATION_PHASES,
  accountsForCompany,
  chooseLeader,
  toggleReplica,
  type DailyControlAccount,
} from "@/modules/control-diario/domain/account-selection";
import {
  calculateDailyBalance,
  parseControlAmountToCents,
  type DailyBalanceEntry,
} from "@/modules/control-diario/domain/balance-rules";
import {
  assertCanReceiveBrokerBalance,
  correctBrokerBalanceReview,
  createBrokerBalanceReview,
  effectiveBrokerBalance,
  type BrokerBalanceReview,
} from "@/modules/control-diario/domain/broker-sync-review";
import {
  allocateResultEqually,
  toBrokerEntry,
  type EqualAllocation,
} from "@/modules/control-diario/domain/result-allocation";

type EntryKind = DailyBalanceEntry["kind"];

type PreviewRow = {
  balanceInCents: number;
  id: number;
  kind: EntryKind;
  operatingResultInCents: number | null;
  valueInCents: number;
};

const entryLabels: Record<EntryKind, string> = {
  balance_update: "Nuevo saldo",
  deposit: "Depósito",
  withdrawal: "Retiro",
};

const syncIssueReasons = [
  "Saldo recibido incorrecto",
  "Actualización faltante",
  "Saldo duplicado",
  "Desconexión de NinjaTrader",
] as const;

type DailyControlPreviewProps = {
  accounts: DailyControlAccount[];
  companies: Array<{ id: string; name: string }>;
};

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    signDisplay: "auto",
    style: "currency",
  }).format(cents / 100);
}

export function DailyControlPreview({ accounts, companies }: DailyControlPreviewProps) {
  const [balanceInCents, setBalanceInCents] = useState<number | null>(null);
  const [entryKind, setEntryKind] = useState<EntryKind>("deposit");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [replicaIds, setReplicaIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<(typeof OPERATION_PHASES)[number]>(
    OPERATION_PHASES[0],
  );
  const [pendingBalance, setPendingBalance] =
    useState<BrokerBalanceReview | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [showContingency, setShowContingency] = useState(false);
  const [correctedAmount, setCorrectedAmount] = useState("");
  const [syncIssueReason, setSyncIssueReason] = useState<string>(
    syncIssueReasons[0],
  );

  const companyAccounts = accountsForCompany(accounts, companyId);
  const companyName =
    companies.find((company) => company.id === companyId)?.name ?? "Sin empresa";
  const accountReferences = new Map(
    companyAccounts.map((account) => [account.id, account.referenceNumber]),
  );
  let pendingAllocation: EqualAllocation[] = [];
  let allocationError: string | null = null;

  if (pendingBalance && leaderId) {
    try {
      pendingAllocation = allocateResultEqually(
        pendingBalance.operatingResultInCents,
        leaderId,
        replicaIds,
      );
    } catch (caughtError) {
      allocationError =
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo calcular la distribución.";
    }
  }

  function appendRow(
    kind: EntryKind,
    valueInCents: number,
    nextBalanceInCents: number,
    operatingResultInCents: number | null,
  ) {
    setRows((currentRows) => [
      ...currentRows,
      {
        balanceInCents: nextBalanceInCents,
        id: currentRows.length + 1,
        kind,
        operatingResultInCents,
        valueInCents,
      },
    ]);
    setBalanceInCents(nextBalanceInCents);
  }

  function addPreviewEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      assertCanReceiveBrokerBalance(pendingBalance);

      const valueInCents = parseControlAmountToCents(amount);
      const entry: DailyBalanceEntry =
        entryKind === "balance_update"
          ? { balanceInCents: valueInCents, kind: entryKind }
          : { amountInCents: valueInCents, kind: entryKind };
      const result = calculateDailyBalance(balanceInCents, entry);

      if (entryKind === "balance_update") {
        if (!companyId || !leaderId) {
          throw new Error(
            "Prepará primero la empresa, la cuenta líder, las réplicas y la fase.",
          );
        }
        setPendingBalance(createBrokerBalanceReview(balanceInCents, valueInCents));
        setReviewOpen(true);
      } else {
        appendRow(
          entryKind,
          valueInCents,
          result.balanceInCents,
          result.operatingResultInCents,
        );
        setEntryKind("balance_update");
      }

      setAmount("");
      setError(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo calcular la vista previa.",
      );
    }
  }

  function confirmPendingBalance() {
    if (!pendingBalance || allocationError || pendingAllocation.length === 0) return;

    const effectiveBalance = effectiveBrokerBalance(pendingBalance);
    appendRow(
      "balance_update",
      effectiveBalance,
      effectiveBalance,
      pendingBalance.operatingResultInCents,
    );
    setPendingBalance(null);
    setReviewOpen(false);
    setShowContingency(false);
    setCorrectedAmount("");
    setEntryKind("balance_update");
  }

  function applyContingency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingBalance) return;

    try {
      const correctedBalanceInCents = parseControlAmountToCents(correctedAmount);
      setPendingBalance(
        correctBrokerBalanceReview(
          pendingBalance,
          balanceInCents,
          correctedBalanceInCents,
          syncIssueReason,
        ),
      );
      setShowContingency(false);
      setError(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo aplicar la contingencia.",
      );
    }
  }

  function resetPreview() {
    setBalanceInCents(null);
    setEntryKind("deposit");
    setAmount("");
    setError(null);
    setRows([]);
    setPendingBalance(null);
    setReviewOpen(false);
    setShowContingency(false);
  }

  function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setLeaderId("");
    setReplicaIds([]);
  }

  function changeLeader(nextLeaderId: string) {
    if (!nextLeaderId) {
      setLeaderId("");
      setReplicaIds([]);
      return;
    }

    const selection = chooseLeader(nextLeaderId, replicaIds);
    setLeaderId(selection.leaderId);
    setReplicaIds(selection.replicaIds);
  }

  function changeReplica(accountId: string) {
    setReplicaIds(toggleReplica(leaderId, replicaIds, accountId));
  }

  return (
    <section className="daily-preview-panel" aria-labelledby="daily-preview-title">
      <div className="daily-preview-heading">
        <div>
          <p className="status">CONTROL DIARIO · VISTA PREVIA</p>
          <h2 id="daily-preview-title">Preparar y revisar la operatoria</h2>
        </div>
        <span className="preview-badge">No guarda datos</span>
      </div>

      <p className="context-note">
        Simula el flujo futuro de NinjaTrader. Primero preparás dónde se registrará
        la próxima operación y luego revisás el nuevo saldo recibido.
      </p>

      <div className={`operation-context-preview${pendingBalance ? " pending" : ""}`}>
        <div className="operation-context-heading">
          <div>
            <p className="status">CONFIGURACIÓN ACTIVA PARA LA PRÓXIMA OPERACIÓN</p>
            <h3>Empresa, líder, réplicas y fase</h3>
          </div>
          {companyId && leaderId && (
            <span className="active-context-badge">Configuración preparada</span>
          )}
        </div>

        <div className="operation-context-fields">
          <div className="form-field">
            <label htmlFor="preview_company">Empresa</label>
            <select
              id="preview_company"
              onChange={(event) => changeCompany(event.target.value)}
              value={companyId}
            >
              <option value="">Elegí una empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="preview_leader">Cuenta líder</label>
            <select
              disabled={companyAccounts.length === 0}
              id="preview_leader"
              onChange={(event) => changeLeader(event.target.value)}
              value={leaderId}
            >
              <option value="">
                {companyId && companyAccounts.length === 0
                  ? "No hay cuentas compradas"
                  : "Elegí la cuenta líder"}
              </option>
              {companyAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  Cuenta {account.referenceNumber}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="preview_phase">Fase</label>
            <select
              id="preview_phase"
              onChange={(event) =>
                setPhase(event.target.value as (typeof OPERATION_PHASES)[number])
              }
              value={phase}
            >
              {OPERATION_PHASES.map((operationPhase) => (
                <option key={operationPhase} value={operationPhase}>
                  {operationPhase}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="replica-section">
          <div className="replica-heading">
            <strong>Cuentas replicadas</strong>
            <span>{replicaIds.length} seleccionadas</span>
          </div>

          {!companyId ? (
            <p className="empty-state">Elegí una empresa para cargar su propia grilla.</p>
          ) : companyAccounts.length === 0 ? (
            <p className="empty-state">
              Esta empresa todavía no tiene cuentas compradas en el período.
            </p>
          ) : !leaderId ? (
            <p className="empty-state">
              Elegí primero la cuenta líder. No aparecerá entre las réplicas.
            </p>
          ) : (
            <div className="replica-grid" aria-label="Seleccionar cuentas replicadas">
              {companyAccounts
                .filter((account) => account.id !== leaderId)
                .map((account) => {
                  const selected = replicaIds.includes(account.id);
                  return (
                    <button
                      aria-pressed={selected}
                      className={`replica-account${selected ? " selected" : ""}`}
                      key={account.id}
                      onClick={() => changeReplica(account.id)}
                      type="button"
                    >
                      {account.referenceNumber}
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {pendingBalance && !reviewOpen && (
          <div className="pending-sync-alert" role="alert">
            <div>
              <strong>Hay un saldo de NinjaTrader sin resolver.</strong>
              <span>No se aceptará otro saldo hasta revisarlo.</span>
            </div>
            <button className="primary-action" onClick={() => setReviewOpen(true)} type="button">
              Revisar ahora
            </button>
          </div>
        )}
      </div>

      <div className="balance-summary" aria-live="polite">
        <span>Último saldo confirmado</span>
        <strong>
          {balanceInCents === null ? "Todavía no establecido" : formatMoney(balanceInCents)}
        </strong>
      </div>

      <form className="daily-preview-form" onSubmit={addPreviewEntry}>
        <div className="form-field">
          <label htmlFor="preview_entry_kind">Acción simulada</label>
          <select
            disabled={Boolean(pendingBalance)}
            id="preview_entry_kind"
            onChange={(event) => setEntryKind(event.target.value as EntryKind)}
            value={entryKind}
          >
            <option value="deposit">
              {balanceInCents === null ? "Depósito inicial" : "Depósito"}
            </option>
            <option disabled={balanceInCents === null} value="withdrawal">
              Retiro
            </option>
            <option disabled={balanceInCents === null} value="balance_update">
              Recibir saldo de NinjaTrader
            </option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="preview_amount">
            {entryKind === "balance_update" ? "Saldo recibido (USD)" : "Importe (USD)"}
          </label>
          <input
            disabled={Boolean(pendingBalance)}
            id="preview_amount"
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            placeholder={balanceInCents === null ? "Ejemplo: 5000" : "Ejemplo: 5500"}
            required
            type="text"
            value={amount}
          />
        </div>

        <button className="primary-action" disabled={Boolean(pendingBalance)} type="submit">
          {entryKind === "balance_update" ? "Simular recepción" : "Agregar movimiento"}
        </button>
      </form>

      {error && (
        <p className="purchase-message error" role="alert">
          {error}
        </p>
      )}

      <div className="preview-history" aria-label="Historial simulado">
        {rows.length === 0 ? (
          <p className="empty-state">
            Comenzá con un depósito inicial para establecer el saldo de referencia.
          </p>
        ) : (
          rows.map((row) => (
            <article className="preview-row" key={row.id}>
              <div>
                <p className="purchase-reference">
                  {row.id}. {entryLabels[row.kind]} · {formatMoney(row.valueInCents)}
                </p>
                <p className="purchase-meta">
                  Saldo posterior: {formatMoney(row.balanceInCents)}
                </p>
              </div>
              <div className="preview-result">
                <span>Resultado operativo</span>
                <strong>
                  {row.operatingResultInCents === null
                    ? "No corresponde"
                    : formatMoney(row.operatingResultInCents)}
                </strong>
              </div>
            </article>
          ))
        )}
      </div>

      {rows.length > 0 && (
        <button className="secondary-action" onClick={resetPreview} type="button">
          Limpiar simulación
        </button>
      )}

      {pendingBalance && reviewOpen && (
        <div className="sync-dialog-backdrop">
          <section
            aria-labelledby="sync-dialog-title"
            aria-modal="true"
            className="sync-dialog"
            role="dialog"
          >
            <p className="status">NUEVO SALDO RECIBIDO DE NINJATRADER</p>
            <h3 id="sync-dialog-title">Revisá dónde se registrará</h3>

            <div className="sync-balance-comparison">
              <div>
                <span>Saldo anterior confirmado</span>
                <strong>{formatMoney(balanceInCents ?? 0)}</strong>
              </div>
              <div>
                <span>Saldo recibido</span>
                <strong>{formatMoney(pendingBalance.receivedBalanceInCents)}</strong>
              </div>
              {pendingBalance.correctedBalanceInCents !== null && (
                <div className="corrected-balance">
                  <span>Saldo corregido por contingencia</span>
                  <strong>{formatMoney(pendingBalance.correctedBalanceInCents)}</strong>
                </div>
              )}
              <div className="operating-result-card">
                <span>Resultado calculado por NODAL</span>
                <strong>{formatMoney(pendingBalance.operatingResultInCents)}</strong>
              </div>
            </div>

            <div className="sync-destination">
              <span>Se propone registrar en</span>
              <strong>
                {companyName} · Líder {accountReferences.get(leaderId) ?? "—"} ·{" "}
                {replicaIds.length === 0
                  ? "sin réplicas"
                  : `réplicas ${replicaIds
                      .map((id) => accountReferences.get(id))
                      .join(", ")}`} · {phase}
              </strong>
            </div>

            {allocationError ? (
              <p className="purchase-message error" role="alert">
                {allocationError} La confirmación permanece bloqueada.
              </p>
            ) : (
              <div className="allocation-list">
                {pendingAllocation.map((entry) => {
                  const brokerEntry = toBrokerEntry(entry.amountInCents);
                  const destination =
                    brokerEntry.destination === "NETO_BROKER_POSITIVE"
                      ? "NETO BROKER +"
                      : brokerEntry.destination === "NETO_BROKER_NEGATIVE"
                        ? "NETO BROKER -"
                        : "Sin resultado broker";

                  return (
                    <article className="allocation-row" key={entry.accountId}>
                      <div>
                        <strong>Cuenta {accountReferences.get(entry.accountId) ?? "—"}</strong>
                        <span>{entry.role === "leader" ? "Líder" : "Réplica"}</span>
                      </div>
                      <div>
                        <span>{destination}</span>
                        <strong>{formatMoney(entry.amountInCents)}</strong>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {pendingBalance.correctionReason && (
              <p className="contingency-audit-note">
                Contingencia aplicada: {pendingBalance.correctionReason}. El dato
                original quedará reservado para auditoría.
              </p>
            )}

            {showContingency ? (
              <form className="contingency-form" onSubmit={applyContingency}>
                <div className="form-field">
                  <label htmlFor="sync_issue_reason">Problema detectado</label>
                  <select
                    id="sync_issue_reason"
                    onChange={(event) => setSyncIssueReason(event.target.value)}
                    value={syncIssueReason}
                  >
                    {syncIssueReasons.map((reason) => (
                      <option key={reason} value={reason}>{reason}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="corrected_balance">Saldo correcto (USD)</label>
                  <input
                    id="corrected_balance"
                    inputMode="decimal"
                    onChange={(event) => setCorrectedAmount(event.target.value)}
                    required
                    type="text"
                    value={correctedAmount}
                  />
                </div>
                <div className="dialog-actions">
                  <button className="primary-action" type="submit">Recalcular</button>
                  <button
                    className="text-action"
                    onClick={() => setShowContingency(false)}
                    type="button"
                  >
                    Volver
                  </button>
                </div>
              </form>
            ) : (
              <div className="dialog-actions">
                <button
                  className="primary-action"
                  disabled={Boolean(allocationError) || pendingAllocation.length === 0}
                  onClick={confirmPendingBalance}
                  type="button"
                >
                  Confirmar en la simulación
                </button>
                <button
                  className="secondary-action"
                  onClick={() => setReviewOpen(false)}
                  type="button"
                >
                  Cambiar cuentas o fase
                </button>
                <button
                  className="text-action danger-text"
                  onClick={() => setShowContingency(true)}
                  type="button"
                >
                  Informar error de sincronización
                </button>
              </div>
            )}

            <p className="dialog-footnote">
              Esta es una simulación visual: todavía no conecta NinjaTrader ni guarda datos.
            </p>
          </section>
        </div>
      )}
    </section>
  );
}
