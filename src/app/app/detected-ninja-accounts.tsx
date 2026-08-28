import type { DetectedNinjaAccount } from "@/modules/ninja/domain/account-classification";
import { createDetectedPurchase } from "./purchase-actions";

type Props = {
  accounts: readonly DetectedNinjaAccount[];
  companyIds: Readonly<Record<string, string>>;
  connectorId: string;
  linkedAccountNames: ReadonlySet<string>;
  mode: string;
  period: string;
  periodId: string;
};

export function DetectedNinjaAccounts({ accounts, companyIds, connectorId, linkedAccountNames, mode, period, periodId }: Props) {
  const detectedPropAccounts = accounts.filter((account) => account.type === "prop");
  const propAccounts = detectedPropAccounts.filter((account) => !linkedAccountNames.has(account.accountName));
  const registeredPropAccounts = detectedPropAccounts.filter((account) => linkedAccountNames.has(account.accountName));
  const brokerAccounts = accounts.filter((account) => account.type === "broker");
  return (
    <section className="ninja-detections" aria-labelledby="ninja-detections-title">
      <div className="ninja-detections-heading">
        <div><p className="status">DETECCIÓN AUTOMÁTICA</p><h3 id="ninja-detections-title">Cuentas encontradas en Ninja</h3></div>
        <span className="ninja-live-badge">Conector activo</span>
      </div>
      {propAccounts.length === 0 && registeredPropAccounts.length === 0 ? <p className="notice">No se detectaron cuentas de fondeo nuevas.</p> : null}
      {registeredPropAccounts.length > 0 ? <div className="ninja-registered-notice"><span>Cuenta detectada y registrada</span><strong>{registeredPropAccounts.map((account) => account.accountName).join(" · ")}</strong></div> : null}
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
              <label>Origen de fondos<select defaultValue="Aporte trader" name="funds_origin"><option value="Aporte trader">Aporte trader</option><option value="Saldo generado">Saldo generado</option></select></label>
            </div>
            <div className="ninja-detected-footer"><p className="ninja-detected-note">La fecha es la primera detección de NODAL y podés corregirla.</p><button className="primary-action" disabled={!companyIds[account.companyCode?.toLowerCase() ?? ""]} type="submit">Confirmar y registrar compra</button></div>
          </form>
        ))}</div>
      ) : null}
      {brokerAccounts.length > 0 ? (
        <div className="ninja-broker-detections" aria-label="Cuentas broker detectadas">
          <p className="status">CUENTAS BROKER DETECTADAS</p>
          {brokerAccounts.map((account) => (
            <article className="ninja-broker-card" key={`${account.connectionName}-${account.accountName}`}>
              <div><strong>{account.connectionName}</strong><span>{account.accountName}</span></div>
              <span className="ninja-broker-badge">Broker</span>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
