import { createClient as createServiceClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireNodalAdmin } from "@/modules/admin/server/admin-access";
import { loadPeriodSummaries } from "@/modules/admin/server/load-period-summaries";
import { loadAdminNinjaTestSupervision } from "@/modules/ninja/server/admin-test-supervision";

import { AppWorkspace } from "../../app-workspace";

type Props = { params: Promise<{ studentId: string }> };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("La vista administrativa no está configurada.");
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const money = (cents: number | null) => cents === null
  ? "—"
  : new Intl.NumberFormat("es-AR", { currency: "USD", style: "currency" }).format(cents / 100);

const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(value))
  : "—";

const periodLabel = (value: string) => new Intl.DateTimeFormat("es-AR", {
  month: "long",
  timeZone: "UTC",
  year: "numeric",
}).format(new Date(`${value}T00:00:00Z`));

function relation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function AdminUserPreview({ params }: Props) {
  const caller = await requireNodalAdmin();
  const { studentId } = await params;
  const service = serviceClient();

  const [{ data: student }, { data: workspace }, supervision] = await Promise.all([
    service.from("nodal_users").select("id,email,display_name,access_state").eq("id", studentId).maybeSingle(),
    service.from("workspaces").select("id,periods(id,period_month)").eq("owner_user_id", studentId).eq("modality", "real").maybeSingle(),
    loadAdminNinjaTestSupervision(caller, studentId),
  ]);
  if (!student || !workspace || !supervision) notFound();

  const period = [...(workspace.periods ?? [])].sort((a, b) => b.period_month.localeCompare(a.period_month))[0];
  if (!period) notFound();

  const [{ data: accounts }, { data: manualBalances }, { data: operationEntries }, { data: controls }, summaries] = await Promise.all([
    service
      .from("accounts")
      .select("id,reference_number,state,state_origin,companies(display_name),purchases(price_cents,purchased_on,funds_origin)")
      .eq("period_id", period.id)
      .order("reference_number"),
    service
      .from("manual_account_balance_observations")
      .select("account_id,cash_value_cents,trade_number,observed_at")
      .eq("period_id", period.id)
      .order("observed_at", { ascending: false }),
    service
      .from("operation_entries")
      .select("account_id,phase,created_at")
      .eq("period_id", period.id)
      .order("created_at", { ascending: false }),
    service
      .from("daily_controls")
      .select("id,control_number,operated_on,kind,balance_after_cents,operating_result_cents,source,created_at")
      .eq("period_id", period.id)
      .order("control_number", { ascending: false }),
    loadPeriodSummaries(service, [period.id]),
  ]);

  const loaded = summaries.get(period.id);
  if (!loaded) notFound();
  const summary = loaded.summary;
  const latestManualBalance = new Map<string, { cashValue: number; trade: number; observedAt: string }>();
  for (const row of manualBalances ?? []) {
    if (!latestManualBalance.has(row.account_id)) {
      latestManualBalance.set(row.account_id, {
        cashValue: Number(row.cash_value_cents),
        observedAt: row.observed_at,
        trade: Number(row.trade_number),
      });
    }
  }
  const linkByAccount = new Map(
    supervision.links.filter((link) => link.closedAt === null).map((link) => [link.accountId, link]),
  );
  const inventoryByName = new Map(supervision.inventory.accounts.map((account) => [account.accountName, account]));
  const latestPhaseByAccount = new Map<string, string>();
  for (const entry of operationEntries ?? []) {
    if (!latestPhaseByAccount.has(entry.account_id)) latestPhaseByAccount.set(entry.account_id, entry.phase);
  }
  const accountRows = (accounts ?? []).map((account) => {
    const company = relation(account.companies);
    const purchase = relation(account.purchases);
    const link = linkByAccount.get(account.id);
    const inventory = link ? inventoryByName.get(link.accountName) : null;
    const manual = latestManualBalance.get(account.id);
    const liveCash = inventory?.cashValue === null || inventory?.cashValue === undefined
      ? null
      : Math.round(Number(inventory.cashValue) * 100);
    return {
      cashValue: manual?.cashValue ?? liveCash,
      company: company?.display_name ?? "Cuenta",
      externalName: link?.accountName ?? `Cuenta ${account.reference_number}`,
      id: account.id,
      observedAt: manual?.observedAt ?? supervision.inventory.observedAt,
      price: Number(purchase?.price_cents ?? 0),
      stage: link?.phase === "Funded" || link?.phase === "Live"
        ? "Funded"
        : latestPhaseByAccount.get(account.id) === "Evaluacion" || !latestPhaseByAccount.has(account.id)
          ? "Evaluation"
          : "Funded",
      state: account.state,
      trade: manual?.trade ?? 0,
    };
  });
  const sessions = supervision.sessions;
  const connectorOnline = supervision.connector?.status === "active";

  return (
    <AppWorkspace
      administrationScope={{ kind: "master" }}
      authorized
      userLabel={student.display_name || student.email}
      username={student.display_name || student.email}
    >
      <div className="notice admin-user-preview-banner" role="status">
        <span><strong>Vista de Ivo:</strong> copia administrativa de solo lectura.</span>
        <Link href={`/app/admin/${student.id}`}>Volver a la ficha</Link>
      </div>

      <section aria-label="Inicio" className="home-overview-panel" id="inicio">
        <div className="home-live-status">
          <span className={connectorOnline ? "online" : undefined}><i aria-hidden="true" />NinjaTrader {connectorOnline ? "en vivo" : "último dato"}</span>
          <strong>Saldo broker {money(summary.brokerBalanceInCents)}</strong>
        </div>
        <div className="home-financial-grid">
          <article className="home-net-result">
            <div className="home-earnings-topline"><small>{periodLabel(period.period_month)}</small></div>
            <span>Ganancias del período</span>
            <strong className={summary.traderGainInCents < 0 ? "negative" : undefined}>{money(summary.traderGainInCents)}</strong>
            <div className="home-earnings-breakdown"><div><span>Operaciones propias</span><strong>{money(summary.traderGainInCents)}</strong></div></div>
          </article>
          <article className="home-financial-metric"><span>Facturación del período</span><strong>{money(summary.realizedGainInCents)}</strong><small>{periodLabel(period.period_month)}</small></article>
          <article className="home-financial-metric home-payout-metric"><span>Payouts</span><strong>{summary.fundingWithdrawals.length}</strong><small>{money(summary.fundingPendingInCents)} pendientes</small></article>
        </div>
        <div className="preview-status-grid">
          <article><span>Cuentas vivas</span><strong>{summary.accountStates.live}</strong></article>
          <article><span>Cuentas cerradas</span><strong>{summary.accountStates.closed}</strong></article>
          <article><span>Resultado del período</span><strong>{money(summary.periodResultInCents)}</strong></article>
        </div>
      </section>

      <section className="purchase-panel" id="cuentas" aria-labelledby="preview-accounts-title">
        <div className="purchase-heading"><h2 id="preview-accounts-title">Cuentas</h2><p className="purchase-count">{accountRows.length} cuentas</p></div>
        <div className="preview-status-grid">
          <article><span>Total</span><strong>{accountRows.length}</strong></article>
          <article><span>Activas</span><strong>{summary.accountStates.live}</strong></article>
          <article><span>Vírgenes</span><strong>{summary.accountStates.virgin}</strong></article>
          <article><span>Invertido</span><strong>{money(accountRows.reduce((total, account) => total + account.price, 0))}</strong></article>
        </div>
        <div className="preview-account-list">
          {accountRows.map((account) => <details className="demo-account-card" key={account.id}>
            <summary>
              <span className="demo-account-identity"><strong>{account.company}</strong><small>{account.externalName}</small></span>
              <span className={`demo-stage ${account.stage.toLowerCase()}`}>{account.stage}</span>
              <span className="demo-account-balance"><small>Cash value</small><strong>{money(account.cashValue)}</strong></span>
              <span className="demo-account-result">{account.state === "closed" ? "Cerrada" : account.state === "live" ? "Activa" : "Sin operar"}</span>
            </summary>
            <div className="preview-account-detail"><span>Última actualización <strong>{dateTime(account.observedAt)}</strong></span><span>Trades registrados <strong>{account.trade}</strong></span><span>Precio <strong>{money(account.price)}</strong></span></div>
          </details>)}
        </div>
      </section>

      <section className="operations-view" id="operaciones" aria-labelledby="preview-operations-title">
        <div className="workspace-section-heading"><h2 id="preview-operations-title">Operaciones</h2></div>
        <div className="preview-status-grid">
          <article><span>En curso</span><strong>{sessions.filter((session) => session.status !== "closed").length}</strong></article>
          <article><span>Cerradas</span><strong>{sessions.filter((session) => session.status === "closed").length}</strong></article>
          <article><span>Saldo broker</span><strong>{money(summary.brokerBalanceInCents)}</strong></article>
        </div>
        <div className="preview-operation-list">
          {sessions.length === 0 ? <p className="empty-state">No hay operaciones registradas.</p> : sessions.map((session) => <article key={session.id}>
            <div><strong>{session.accountName}</strong><span>{session.connectionName}</span></div>
            <div><span>{session.direction || "Sin dirección"} · {session.quantity ?? 0} · {session.instruments.join(", ") || "Sin instrumento"}</span><strong>{money(session.result === null ? null : Math.round(session.result * 100))}</strong></div>
            <small>{session.status === "closed" ? "Cerrada" : session.status === "settling" ? "Confirmando cierre" : "En curso"} · {dateTime(session.openedAt)}</small>
          </article>)}
        </div>
      </section>

      <section className="accounting-view" id="contabilidad" aria-labelledby="preview-accounting-title">
        <div className="workspace-section-heading"><h2 id="preview-accounting-title">Contabilidad</h2></div>
        <div className="preview-accounting-grid">
          <article className="featured"><span>Facturación</span><strong>{money(summary.realizedGainInCents)}</strong><small>{periodLabel(period.period_month)}</small></article>
          <article><span>Resultado del período</span><strong>{money(summary.periodResultInCents)}</strong></article>
          <article><span>Saldo broker</span><strong>{money(summary.brokerBalanceInCents)}</strong></article>
          <article><span>Comisión de usuario</span><strong>{money(summary.commissionInCents)}</strong></article>
          <article><span>Ganancia del usuario</span><strong>{money(summary.traderGainInCents)}</strong></article>
        </div>
        <details className="preview-ledger" open>
          <summary><span>Historial de saldo broker</span><strong>{controls?.length ?? 0}</strong></summary>
          <div>{(controls ?? []).map((control) => <p key={control.id}><span>{control.kind === "balance_update" ? "Actualización" : control.kind === "deposit" ? "Depósito" : "Retiro"} · {control.operated_on}</span><strong>{money(Number(control.balance_after_cents))}</strong><small>{control.operating_result_cents === null ? "" : `Resultado ${money(Number(control.operating_result_cents))}`}</small></p>)}</div>
        </details>
      </section>
    </AppWorkspace>
  );
}
