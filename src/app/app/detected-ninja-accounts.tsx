"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";

import type { DetectedNinjaAccount } from "@/modules/ninja/domain/account-classification";
import { ninjaAccountRegistrationKey } from "@/modules/ninja/domain/account-registration-key";
import { createDetectedPurchase } from "./purchase-actions";
import { PurchasePaymentFields } from "./purchase-payment-fields";
import { preventNumberWheelChange } from "./prevent-number-wheel-change";

type Props = {
  companyIds: Readonly<Record<string, string>>;
  excludedAccountKeys: ReadonlySet<string>;
  registeredAccountKeys: ReadonlySet<string>;
  mode: string;
  period: string;
  periodId: string;
  sources: readonly Readonly<{
    accounts: readonly DetectedNinjaAccount[];
    connectorId: string;
    online: boolean;
  }>[];
  wallets: ReadonlyArray<{ balanceInCents: number; id: string; name: string }>;
};

const omissionsChangedEvent = "nodal:ninja-omissions-changed";

function subscribeToOmissions(callback: () => void) {
  window.addEventListener(omissionsChangedEvent, callback);
  return () => window.removeEventListener(omissionsChangedEvent, callback);
}

function readOmissions(key: string) {
  try { return window.sessionStorage.getItem(key) ?? "[]"; } catch { return "[]"; }
}

function parseOmissions(value: string): ReadonlySet<string> {
  try {
    const keys: unknown = JSON.parse(value);
    return new Set(Array.isArray(keys) ? keys.filter((key): key is string => typeof key === "string") : []);
  } catch { return new Set(); }
}

function omissionStorageKey(connectorId: string) {
  return `nodal:omitted-ninja-accounts:${connectorId}`;
}

function readAllOmissions(sources: Props["sources"]) {
  const keys = sources.flatMap((source) => [
    ...parseOmissions(readOmissions(omissionStorageKey(source.connectorId))),
  ]);
  return JSON.stringify([...new Set(keys)].sort());
}

export function DetectedNinjaAccounts({ companyIds, excludedAccountKeys, registeredAccountKeys, mode, period, periodId, sources, wallets }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const omittedKeys = parseOmissions(useSyncExternalStore(
    subscribeToOmissions,
    () => readAllOmissions(sources),
    () => "[]",
  ));
  const propAccounts = sources.flatMap((source) => source.accounts
    .filter((account) => account.type === "prop")
    .map((account) => ({ account, connectorId: source.connectorId })))
    .filter(({ account, connectorId }) => {
      const key = ninjaAccountRegistrationKey(connectorId, account.connectionName, account.accountName);
      return !registeredAccountKeys.has(key) && !excludedAccountKeys.has(key) && !omittedKeys.has(key);
    });
  const online = sources.some((source) => source.online);

  function refreshAccounts() {
    for (const source of sources) {
      try { window.sessionStorage.removeItem(omissionStorageKey(source.connectorId)); } catch { /* Sin almacenamiento, no hay omisiones guardadas. */ }
    }
    window.dispatchEvent(new Event(omissionsChangedEvent));
    setRefreshMessage(null);
    startRefresh(async () => {
      try {
        const results = await Promise.all(sources.map(async (source) => {
          const response = await fetch("/api/ninja-account-registration-exclusions/restore", {
            body: JSON.stringify({ connectorId: source.connectorId }),
            headers: { "content-type": "application/json" },
            method: "POST",
          });
          return response.json() as Promise<{ message?: unknown; ok?: unknown; restoredCount?: unknown }>;
        }));
        const failed = results.find((result) => result.ok !== true);
        const restored = results.reduce((total, result) => total + Number(result.restoredCount ?? 0), 0);
        setRefreshMessage(failed && typeof failed.message === "string"
          ? failed.message
          : restored > 0
            ? restored === 1
              ? "La cuenta eliminada quedó habilitada para volver a registrarse."
              : `${restored} cuentas eliminadas volvieron a quedar disponibles para registrar.`
            : "Listado actualizado con la última información de NinjaTrader.");
      } catch {
        setRefreshMessage("No pudimos actualizar las cuentas detectadas.");
      }
      router.refresh();
    });
  }

  function omitAccount(connectorId: string, account: DetectedNinjaAccount) {
    const key = ninjaAccountRegistrationKey(connectorId, account.connectionName, account.accountName);
    const storageKey = omissionStorageKey(connectorId);
    const next = new Set([...parseOmissions(readOmissions(storageKey)), key]);
    try { window.sessionStorage.setItem(storageKey, JSON.stringify([...next])); } catch { return; }
    window.dispatchEvent(new Event(omissionsChangedEvent));
  }

  return (
    <section className="ninja-detections" aria-labelledby="ninja-detections-title">
      <div className="ninja-detections-heading">
        <h3 id="ninja-detections-title">Cuentas nuevas detectadas</h3>
        <div className="ninja-detections-controls">
          <button className="secondary-action" disabled={refreshing} onClick={refreshAccounts} title="Volver a mostrar cuentas omitidas y actualizar el listado" type="button">
            {refreshing ? "Actualizando…" : "Actualizar"}
          </button>
          <span className={`ninja-live-badge${online ? "" : " offline"}`}>
            {online ? "Conectado" : "Sin señal"}
          </span>
        </div>
      </div>
      {refreshMessage ? <p className="ninja-refresh-message" role="status">{refreshMessage}</p> : null}
      {propAccounts.length === 0 ? <p className="ninja-empty">Sin cuentas nuevas</p> : null}
      {propAccounts.length > 0 ? (
        <div className="ninja-detected-grid">{propAccounts.map(({ account, connectorId }) => (
          <form action={createDetectedPurchase} className="ninja-detected-card" key={`${connectorId}-${account.connectionName}-${account.accountName}`}>
            <input name="mode" type="hidden" value={mode} />
            <input name="period" type="hidden" value={period} />
            <input name="period_id" type="hidden" value={periodId} />
            <input name="company_id" type="hidden" value={companyIds[account.companyCode?.toLowerCase() ?? ""] ?? ""} />
            <input name="connector_id" type="hidden" value={connectorId} />
            <input name="connection_name" type="hidden" value={account.connectionName} />
            <input name="external_account_name" type="hidden" value={account.accountName} />
            <input name="first_seen_at" type="hidden" value={account.firstSeenAt} />
            <div className="ninja-account-title"><div><strong>{account.company}{account.product ? ` · ${account.product}` : ""}</strong><span>{account.accountName}</span><small>{account.connectionName}</small></div><span className={`ninja-phase ninja-phase-${account.phase?.toLowerCase()}`}>{account.phase}</span></div>
            <div className="ninja-registration-fields">
              <label>Fecha de compra sugerida<input defaultValue={account.suggestedPurchaseDate} name="purchased_on" required type="date" /></label>
              <label>Precio de compra (USD)<input inputMode="decimal" min="0" name="price" onWheel={preventNumberWheelChange} placeholder="Completar" required step="0.01" type="number" /></label>
              <label>{account.phase === "Evaluation" ? "Etapa actual" : "Vuelta actual"}
                <select defaultValue={account.phase === "Evaluation" ? "Evaluacion" : "Primera vuelta"} name="accounting_phase" required>
                  {account.phase === "Evaluation"
                    ? <option value="Evaluacion">Evaluación</option>
                    : ["Primera vuelta", "Segunda vuelta", "Tercera vuelta", "Cuarta vuelta", "Quinta vuelta"].map((phase) => (
                      <option key={phase} value={phase}>{phase}</option>
                    ))}
                </select>
              </label>
              <label>Último día completado<input defaultValue="0" inputMode="numeric" min="0" name="completed_trade_days" required step="1" type="number" /></label>
              <PurchasePaymentFields wallets={[...wallets]} />
            </div>
            <div className="ninja-detected-footer">
              <p className="ninja-detected-note">Primera detección: {account.suggestedPurchaseDate}</p>
              <div className="ninja-detected-actions">
                <button className="secondary-action" onClick={() => omitAccount(connectorId, account)} type="button">Omitir</button>
                <button className="primary-action" disabled={!companyIds[account.companyCode?.toLowerCase() ?? ""]} type="submit">Registrar cuenta</button>
              </div>
            </div>
          </form>
        ))}</div>
      ) : null}
    </section>
  );
}
