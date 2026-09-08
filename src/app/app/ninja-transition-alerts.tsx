import { registerNinjaReset, resolveNinjaTransition } from "./ninja-transition-actions";

export type NinjaTransitionAlert = Readonly<{
  automatic: boolean;
  connectionName: string;
  eventType: string;
  fromAccountName: string | null;
  id: string;
  occurredAt: string;
  reason: string;
  resolutionStatus: string;
  toAccountName: string | null;
}>;

const titles: Record<string, string> = {
  burned: "Cuenta cerrada por quema",
  evaluation_to_funded: "Cambio a Funded detectado",
  funded_to_live_review: "Confirmación de cuenta Live requerida",
  new_account: "Nueva cuenta detectada",
  reset: "Reset detectado",
  reset_after_burn: "Nueva evaluación después de una quema",
  review_disappearance: "Revisión de cuenta requerida",
};

const messages: Record<string, string> = { confirmed: "Cambio confirmado y aplicado.", dismissed: "Alerta descartada sin modificar la cuenta.", failed: "No se pudo aplicar la decisión.", invalid: "Revisá los datos ingresados.", reset_registered: "Reset registrado como una nueva compra." };

export function NinjaTransitionAlerts({ alerts, mode, period, periodId, result }: Readonly<{ alerts: readonly NinjaTransitionAlert[]; mode: string; period: string; periodId: string; result?: string }>) {
  if (!alerts.length) return null;
  return <section className="ninja-transition-alerts" aria-labelledby="ninja-transition-alerts-title">
    <div className="ninja-transition-alerts-heading"><div><p className="status">ACTIVIDAD DE NINJA</p><h3 id="ninja-transition-alerts-title">Cambios detectados</h3></div><span>{alerts.length}</span></div>
    {result && messages[result] ? <p className={`ninja-transition-result ${["failed", "invalid"].includes(result) ? "error" : "success"}`}>{messages[result]}</p> : null}
    <div className="ninja-transition-alert-list">{alerts.map((alert) => <article className={alert.automatic ? "automatic" : "review"} key={alert.id}>
      <div><strong>{titles[alert.eventType] ?? "Cambio detectado"}</strong><span>{[alert.fromAccountName, alert.toAccountName].filter(Boolean).join(" → ") || alert.connectionName}</span></div>
      <p>{alert.reason}</p>
      <span className="ninja-transition-status">{statusLabel(alert)}</span>
      {alert.resolutionStatus === "pending" && alert.eventType === "funded_to_live_review" ? <form action={resolveNinjaTransition} className="ninja-transition-actions">
        <Context alert={alert} mode={mode} period={period} />
        <button className="primary-action" name="resolution" value="confirm_transition">Confirmar Live</button>
        <button className="secondary-action" name="resolution" value="dismiss">No corresponde</button>
      </form> : null}
      {alert.resolutionStatus === "pending" && alert.eventType === "review_disappearance" ? <form action={resolveNinjaTransition} className="ninja-transition-actions">
        <Context alert={alert} mode={mode} period={period} />
        <button className="primary-action" name="resolution" value="confirm_closed">Confirmar cierre</button>
        <button className="secondary-action" name="resolution" value="dismiss">No corresponde</button>
      </form> : null}
      {alert.resolutionStatus === "pending" && ["reset", "reset_after_burn"].includes(alert.eventType) ? <form action={registerNinjaReset} className="ninja-reset-form">
        <Context alert={alert} mode={mode} period={period} /><input name="period_id" type="hidden" value={periodId} />
        <label>Fecha<input defaultValue={alert.occurredAt.slice(0, 10)} name="purchased_on" required type="date" /></label>
        <label>Precio (USD)<input min="0" name="price" required step="0.01" type="number" /></label>
        <label>Origen<select defaultValue="Aporte trader" name="funds_origin"><option>Aporte trader</option><option>Saldo generado</option></select></label>
        <button className="primary-action">Registrar reset</button>
      </form> : null}
      {alert.resolutionStatus === "pending" && alert.eventType === "new_account" ? <a className="primary-action ninja-alert-link" href="#cuentas">Completar cuenta</a> : null}
    </article>)}</div>
  </section>;
}

function Context({ alert, mode, period }: Readonly<{ alert: NinjaTransitionAlert; mode: string; period: string }>) {
  return <><input name="event_id" type="hidden" value={alert.id} /><input name="mode" type="hidden" value={mode} /><input name="period" type="hidden" value={period} /></>;
}

function statusLabel(alert: NinjaTransitionAlert) {
  if (alert.resolutionStatus === "confirmed") return "Confirmado";
  if (alert.resolutionStatus === "dismissed") return "Descartado";
  return alert.resolutionStatus === "automatic" ? "Registrado automáticamente" : "Requiere confirmación";
}
