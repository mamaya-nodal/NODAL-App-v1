"use client";

import { FormEvent, useState } from "react";

import {
  calculateDailyBalance,
  parseControlAmountToCents,
  type DailyBalanceEntry,
} from "@/modules/control-diario/domain/balance-rules";

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

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    signDisplay: "auto",
    style: "currency",
  }).format(cents / 100);
}

export function DailyControlPreview() {
  const [balanceInCents, setBalanceInCents] = useState<number | null>(null);
  const [entryKind, setEntryKind] = useState<EntryKind>("deposit");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);

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

      {rows.length > 0 && (
        <button className="secondary-action" onClick={resetPreview} type="button">
          Limpiar simulación
        </button>
      )}
    </section>
  );
}
