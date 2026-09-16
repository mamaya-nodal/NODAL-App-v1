import type { DetectedNinjaAccount } from "@/modules/ninja/domain/account-classification";
import { createDetectedPurchase } from "./purchase-actions";
import { PurchasePaymentFields } from "./purchase-payment-fields";

type Props = {
  accounts: readonly DetectedNinjaAccount[];
  companyIds: Readonly<Record<string, string>>;
  connectorId: string;
  linkedAccountNames: ReadonlySet<string>;
  mode: string;
  online: boolean;
  period: string;
  periodId: string;
  wallets: ReadonlyArray<{ id: string; name: string }>;
};

export function DetectedNinjaAccounts({ accounts, companyIds, connectorId, linkedAccountNames, mode, online, period, periodId, wallets }: Props) {
  const detectedPropAccounts = accounts.filter((account) => account.type === "prop");
  const propAccounts = detectedPropAccounts.filter((account) => !linkedAccountNames.has(account.accountName));
  return (
    <section className="ninja-detections" aria-labelledby="ninja-detections-title">
      <div className="ninja-detections-heading">
        <h3 id="ninja-detections-title">NinjaTrader</h3>
        <span className={`ninja-live-badge${online ? "" : " offline"}`}>
          {online ? "Conectado" : "Sin señal"}
        </span>
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
            <div className="ninja-detected-footer"><p className="ninja-detected-note">Primera detección: {account.suggestedPurchaseDate}</p><button className="primary-action" disabled={!companyIds[account.companyCode?.toLowerCase() ?? ""]} type="submit">Registrar cuenta</button></div>
          </form>
        ))}</div>
      ) : null}
    </section>
  );
}
