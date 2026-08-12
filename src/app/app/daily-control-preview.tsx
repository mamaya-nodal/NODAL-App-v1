"use client";

import { FormEvent, useState } from "react";

import {
  calculateDailyBalance,
  parseControlAmountToCents,
  type DailyBalanceEntry,
} from "@/modules/control-diario/domain/balance-rules";
import {
  OPERATION_PHASES,
  accountsForCompany,
  chooseLeader,
  toggleReplica,
  type DailyControlAccount,
} from "@/modules/control-diario/domain/account-selection";
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
  const companyAccounts = accountsForCompany(accounts, companyId);
  const latestRow = rows.length > 0 ? rows[rows.length - 1] : null;
  const latestOperatingResult = latestRow?.operatingResultInCents ?? null;
  let allocation: EqualAllocation[] = [];
  let allocationError: string | null = null;

  if (latestOperatingResult !== null && leaderId) {
    try {
      allocation = allocateResultEqually(
        latestOperatingResult,
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

  const accountReferences = new Map(
    companyAccounts.map((account) => [account.id, account.referenceNumber]),
  );

  function addPreviewEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const valueInCents = parseControlAmountToCents(amount);
      const entry: DailyBalanceEntry =
        entryKind === "balance_update"
          ? { balanceInCents: valueInCents, kind: entryKind }
          : { amountInCents: valueInCents, kind: entryKind };
      const result = calculateDailyBalance(balanceInCents, entry);

      setRows((currentRows) => [
        ...currentRows,
        {
          balanceInCents: result.balanceInCents,
          id: currentRows.length + 1,
          kind: entryKind,
          operatingResultInCents: result.operatingResultInCents,
          valueInCents,
        },
      ]);
      setBalanceInCents(result.balanceInCents);
      setEntryKind("balance_update");
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

  function resetPreview() {
    setBalanceInCents(null);
    setEntryKind("deposit");
    setAmount("");
    setError(null);
    setRows([]);
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
          <h2 id="daily-preview-title">Probar saldo y resultado</h2>
        </div>
        <span className="preview-badge">No guarda datos</span>
      </div>

      <p className="context-note">
        Esta simulación permite revisar el cálculo antes de conectar el guardado
        real. Al recargar la página se borra por completo.
      </p>

      <div className="balance-summary" aria-live="polite">
        <span>Saldo de referencia simulado</span>
        <strong>
          {balanceInCents === null ? "Todavía no establecido" : formatMoney(balanceInCents)}
        </strong>
      </div>

      <form className="daily-preview-form" onSubmit={addPreviewEntry}>
        <div className="form-field">
          <label htmlFor="preview_entry_kind">Acción</label>
          <select
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
              Informar nuevo saldo
            </option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="preview_amount">
            {entryKind === "balance_update" ? "Nuevo saldo (USD)" : "Importe (USD)"}
          </label>
          <input
            id="preview_amount"
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            placeholder={balanceInCents === null ? "Ejemplo: 5000" : "Ejemplo: 5500"}
            required
            type="text"
            value={amount}
          />
        </div>

        <button className="primary-action" type="submit">
          Agregar a la simulación
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

      <div className="operation-context-preview">
        <div>
          <p className="status">CONTEXTO OPERATIVO PREPARADO</p>
          <h3>Empresa, líder, réplicas y fase</h3>
        </div>
        <p className="context-note">
          Esta selección usa solamente cuentas compradas en la empresa y período
          actuales. La líder queda siempre separada de las réplicas.
        </p>

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

        <div className="allocation-preview" aria-live="polite">
          <div className="allocation-heading">
            <div>
              <p className="status">VISTA PREVIA ANTES DE CONFIRMAR</p>
              <h3>Distribución automática</h3>
            </div>
            <strong>
              {latestOperatingResult === null
                ? "Sin resultado pendiente"
                : formatMoney(latestOperatingResult)}
            </strong>
          </div>

          {latestOperatingResult === null ? (
            <p className="empty-state">
              Informá un nuevo saldo para obtener el resultado operativo a distribuir.
            </p>
          ) : !leaderId ? (
            <p className="empty-state">
              Elegí la cuenta líder para ver el reparto entre las cuentas participantes.
            </p>
          ) : allocationError ? (
            <p className="purchase-message error" role="alert">
              {allocationError} El ajuste excepcional sigue pendiente de validación.
            </p>
          ) : (
            <>
              <div className="allocation-list">
                {allocation.map((entry) => {
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
                        <strong>
                          Cuenta {accountReferences.get(entry.accountId) ?? "—"}
                        </strong>
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
              <p className="allocation-check">
                Total comprobado: {formatMoney(latestOperatingResult)} entre{" "}
                {allocation.length} {allocation.length === 1 ? "cuenta" : "cuentas"}.
              </p>
            </>
          )}

          <button
            className="primary-action"
            disabled
            title="El guardado definitivo todavía no está habilitado"
            type="button"
          >
            Confirmar y crear registros
          </button>
          <p className="context-note">
            El botón permanece bloqueado hasta terminar y probar el guardado
            transaccional. Esta pantalla todavía no modifica datos.
          </p>
        </div>
      </div>

      {rows.length > 0 && (
        <button className="secondary-action" onClick={resetPreview} type="button">
          Limpiar simulación
        </button>
      )}
    </section>
  );
}
