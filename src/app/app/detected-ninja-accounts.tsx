"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore, useTransition } from "react";

import type { DetectedNinjaAccount } from "@/modules/ninja/domain/account-classification";
import { ninjaAccountRegistrationKey } from "@/modules/ninja/domain/account-registration-key";
import { createDetectedPurchase } from "./purchase-actions";
import { PurchasePaymentFields } from "./purchase-payment-fields";

type Props = {
  accounts: readonly DetectedNinjaAccount[];
  companyIds: Readonly<Record<string, string>>;
  connectorId: string;
  excludedAccountKeys: ReadonlySet<string>;
  registeredAccountKeys: ReadonlySet<string>;
  mode: string;
  online: boolean;
  period: string;
  periodId: string;
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

export function DetectedNinjaAccounts({ accounts, companyIds, connectorId, excludedAccountKeys, registeredAccountKeys, mode, online, period, periodId, wallets }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const omissionStorageKey = `nodal:omitted-ninja-accounts:${connectorId}`;
  const omittedKeys = parseOmissions(useSyncExternalStore(subscribeToOmissions, () => readOmissions(omissionStorageKey), () => "[]"));
  const detectedPropAccounts = accounts.filter((account) => account.type === "prop");
  const propAccounts = detectedPropAccounts.filter((account) => {
    const key = ninjaAccountRegistrationKey(connectorId, account.connectionName, account.accountName);
    return !registeredAccountKeys.has(key) && !excludedAccountKeys.has(key) && !omittedKeys.has(key);
  });

  function refreshAccounts() {
    try { window.sessionStorage.removeItem(omissionStorageKey); } catch { /* Sin almacenamiento, no hay omisiones guardadas. */ }
    window.dispatchEvent(new Event(omissionsChangedEvent));
    startRefresh(() => router.refresh());
  }

  function omitAccount(account: DetectedNinjaAccount) {
    const key = ninjaAccountRegistrationKey(connectorId, account.connectionName, account.accountName);
    const next = new Set([...omittedKeys, key]);
    try { window.sessionStorage.setItem(omissionStorageKey, JSON.stringify([...next])); } catch { return; }
    window.dispatchEvent(new Event(omissionsChangedEvent));
  }

  return (
    <section className="ninja-detections" aria-labelledby="ninja-detections-title">
      <div className="ninja-detections-heading">
        <h3 id="ninja-detections-title">NinjaTrader</h3>
        <div className="ninja-detections-controls">
          <button className="secondary-action" disabled={refreshing} onClick={refreshAccounts} title="Volver a mostrar cuentas omitidas y actualizar el listado" type="button">
            {refreshing ? "Actualizando…" : "Actualizar"}
          </button>
          <span className={`ninja-live-badge${online ? "" : " offline"}`}>
            {online ? "Conectado" : "Sin señal"}
          </span>
        </div>
      </div>
      {propAccounts.length === 0 ? <p className="ninja-empty">Sin cuentas nuevas</p> : null}
      {propAccounts.length > 0 ? (
        <div className="ninja-detected-grid">{propAccounts.map((account) => (
          <form action={createDetectedPurchase} className="ninja-detected-card" key={`${account.connectionName}-${account.accountName}`}>
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
              <label>Precio de compra (USD)<input inputMode="decimal" min="0" name="price" placeholder="Completar" required step="0.01" type="number" /></label>
              <PurchasePaymentFields wallets={[...wallets]} />
            </div>
            <div className="ninja-detected-footer">
              <p className="ninja-detected-note">Primera detección: {account.suggestedPurchaseDate}</p>
              <div className="ninja-detected-actions">
                <button className="secondary-action" onClick={() => omitAccount(account)} type="button">Omitir</button>
                <button className="primary-action" disabled={!companyIds[account.companyCode?.toLowerCase() ?? ""]} type="submit">Registrar cuenta</button>
              </div>
            </div>
          </form>
        ))}</div>
      ) : null}
    </section>
  );
}
