"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";
import { buildSummaryAlerts } from "@/modules/summary/domain/summary-alerts";
import { buildConciliationBreakdown } from "@/modules/summary/domain/conciliation-breakdown";
import {
  collectFundingWithdrawal,
  createFundingWithdrawal,
  createWalletMovement,
} from "./summary-actions";

type Props = Readonly<{
  accounts: Array<{ id: string; label: string }>;
  embedded?: boolean;
  economicTrace?: EconomicTraceItem[];
  periodLabel?: string;
  periods?: AccountingPeriodView[];
  periodId: string;
  summary: OperationalSummary;
}>;

export type EconomicTraceItem = Readonly<{
  amountInCents: number;
  date: string;
  id: string;
  label: string;
  source: "Automático" | "Manual";
  status?: string | null;
}>;

export type AccountingPeriodView = Readonly<{
  current: boolean;
  label: string;
  summary: Pick<
    OperationalSummary,
    "commissionInCents" | "periodResultInCents" | "realizedGainInCents" | "traderGainInCents"
  >;
}>;

const money = (cents: number) =>
  new Intl.NumberFormat("es-AR", {
    currency: "USD",
    signDisplay: "auto",
    style: "currency",
  }).format(cents / 100);

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).format(new Date());

const date = (value: string) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );

const labels = {
  external_contribution: "Aporte externo a billetera",
  personal_withdrawal: "Retiro personal desde billetera",
  prior_pending_collection: "Cobro pendiente anterior",
} as const;

export function ProgressSummary({ accounts, economicTrace = [], embedded = false, periodId, periodLabel, periods = [], summary }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const alerts = buildSummaryAlerts(summary);
  const conciliation = buildConciliationBreakdown(summary);
  const hasConciliationDifference =
    conciliation.capital.differenceInCents !== 0 ||
    conciliation.gains.differenceInCents !== 0;
  const recentPeriods = periods.slice(0, 2);
  const archivedPeriods = periods.slice(2);

  async function wallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const result = await createWalletMovement({
      amount: String(form.get("amount") ?? ""),
      date: String(form.get("date") ?? ""),
      kind: String(form.get("kind") ?? ""),
      observation: String(form.get("observation") ?? ""),
      periodId,
    });
    setSaving(false);
    setMessage(result.message);
    if (result.ok) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  async function withdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const result = await createFundingWithdrawal({
      accountId: String(form.get("account") ?? ""),
      amount: String(form.get("amount") ?? ""),
      approvedOn: String(form.get("approved_on") ?? ""),
      periodId,
    });
    setSaving(false);
    setMessage(result.message);
    if (result.ok) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  async function collect(id: string) {
    setSaving(true);
    const result = await collectFundingWithdrawal({
      collectedOn: today(),
      periodId,
      withdrawalId: id,
    });
    setSaving(false);
    setMessage(result.message);
    if (result.ok) router.refresh();
  }

  return (
    <section
      aria-label={embedded ? "Resumen contable" : undefined}
      aria-labelledby={embedded ? undefined : "progress-summary-title"}
      className="progress-summary-panel"
      id="resumen"
    >
      {!embedded && (
        <div className="summary-heading">
          <h2 id="progress-summary-title">Contabilidad</h2>
        </div>
      )}

      <div className="demo-accounting-grid">
        <article className="demo-accounting-primary">
          <span>Facturación</span>
          <strong>{money(summary.realizedGainInCents)}</strong>
          {periodLabel && <small>{periodLabel}</small>}
        </article>
        <article><span>Resultado del período</span><strong>{money(summary.periodResultInCents)}</strong></article>
        <article><span>Saldo broker</span><strong>{summary.brokerBalanceInCents === null ? "—" : money(summary.brokerBalanceInCents)}</strong></article>
        <article><span>Comisión de usuario</span><strong>{money(summary.commissionInCents)}</strong><small>{summary.commissionRateLabel}</small></article>
        <article><span>Ganancia del usuario</span><strong>{money(summary.traderGainInCents)}</strong></article>
      </div>

      {periods.length > 0 && (
        <>
          <div className="demo-periods-heading"><h3>Períodos</h3><span>{periods.length}</span></div>
          <div className="demo-period-cards">
            {recentPeriods.map((period) => (
              <article className={period.current ? "current" : undefined} key={period.label}>
                <div><strong>{period.label}</strong><span>{period.current ? "Actual" : "Cerrado"}</span></div>
                <dl>
                  <div><dt>Facturación</dt><dd>{money(period.summary.realizedGainInCents)}</dd></div>
                  <div><dt>Comisión</dt><dd>{money(period.summary.commissionInCents)}</dd></div>
                  <div><dt>Ganancia usuario</dt><dd>{money(period.summary.traderGainInCents)}</dd></div>
                  <div><dt>Resultado período</dt><dd>{money(period.summary.periodResultInCents)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          {archivedPeriods.length > 0 && (
            <details className="demo-operation-disclosure accounting-period-archive">
              <summary><span>Períodos anteriores</span><strong>{archivedPeriods.length}</strong><i aria-hidden="true" /></summary>
              <div className="demo-period-cards">
                {archivedPeriods.map((period) => (
                  <article key={period.label}>
                    <div><strong>{period.label}</strong><span>Cerrado</span></div>
                    <dl>
                      <div><dt>Facturación</dt><dd>{money(period.summary.realizedGainInCents)}</dd></div>
                      <div><dt>Comisión</dt><dd>{money(period.summary.commissionInCents)}</dd></div>
                      <div><dt>Ganancia usuario</dt><dd>{money(period.summary.traderGainInCents)}</dd></div>
                      <div><dt>Resultado período</dt><dd>{money(period.summary.periodResultInCents)}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {alerts.length > 0 && (
        <div className="summary-section summary-alerts" aria-live="polite">
          <h3>Requiere atención</h3>
          <div className="summary-alert-list">
            {alerts.map((alert) => (
              <article className={`summary-alert summary-alert-${alert.severity}`} key={alert.code}>
                <div className="summary-alert-copy">
                  <strong>{alert.title}</strong>
                  <p>{alert.detail}</p>
                </div>
                <a href={alert.href}>Revisar</a>
              </article>
            ))}
          </div>
        </div>
      )}

      <details className="demo-operation-disclosure accounting-balances">
        <summary><span>Otros saldos</span><strong>{money(summary.walletBalanceInCents)}</strong><i aria-hidden="true" /></summary>
        <div className="demo-wallets">
          <p><span>Saldo billetera</span><strong>{money(summary.walletBalanceInCents)}</strong></p>
          <p><span>Payouts pendientes</span><strong>{money(summary.fundingPendingInCents)}</strong></p>
          <p><span>Capital neto aportado</span><strong>{money(summary.capitalNetInCents)}</strong></p>
          <p><span>Flotante</span><strong>{money(summary.floatingInCents)}</strong></p>
        </div>
      </details>

      {economicTrace.length > 0 && (
        <details className="demo-operation-disclosure accounting-economic-trace">
          <summary><span>Movimientos económicos</span><strong>{economicTrace.length}</strong><i aria-hidden="true" /></summary>
          <div className="economic-trace-list">
            {economicTrace.map((item) => (
              <article key={item.id}>
                <div><strong>{item.label}</strong><span>{date(item.date)} · {item.source}{item.status ? ` · ${item.status}` : ""}</span></div>
                <strong>{money(item.amountInCents)}</strong>
              </article>
            ))}
          </div>
        </details>
      )}

      <details className="accounting-disclosure demo-operation-disclosure" open={hasConciliationDifference ? true : undefined}>
        <summary>
          <span>Conciliaciones</span>
          <strong>{hasConciliationDifference ? "Revisar" : "Sin diferencias"}</strong>
        </summary>
        <div className="conciliation-grid">
          <ConciliationCard
            difference={conciliation.capital.differenceInCents}
            leftLines={conciliation.capital.observable}
            leftTitle="Posición observable"
            leftTotal={summary.positionObservableInCents}
            rightLines={conciliation.capital.expected}
            rightTitle="Posición esperada"
            rightTotal={summary.positionExpectedInCents}
            title="Capital"
          />
          <ConciliationCard
            difference={conciliation.gains.differenceInCents}
            leftLines={[]}
            leftTitle="Cuentas cerradas"
            leftTotal={conciliation.gains.closedInCents}
            rightLines={conciliation.gains.reconstructed}
            rightTitle="Ganancia reconstruida"
            rightTotal={summary.realizedGainInCents - conciliation.gains.differenceInCents}
            title="Ganancias"
          />
        </div>
      </details>

      <div className="accounting-actions">
        <details className="accounting-action-card demo-operation-disclosure">
          <summary>
            <span>Movimientos de billetera</span>
            <strong>{summary.walletMovements.length}</strong>
          </summary>
          <form className="summary-form" onSubmit={wallet}>
            <input defaultValue={today()} name="date" required type="date" />
            <select defaultValue="external_contribution" name="kind">
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input inputMode="decimal" name="amount" placeholder="Importe USD" required />
            <input name="observation" placeholder="Observación (opcional)" />
            <button disabled={saving}>Guardar movimiento</button>
          </form>
          {summary.walletMovements.length > 0 && (
            <div className="summary-list">
              {summary.walletMovements.map((movement) => (
                <p key={movement.id}>
                  <strong>{date(movement.occurredOn)}</strong> · {labels[movement.kind]} · {money(movement.amountInCents)}
                </p>
              ))}
            </div>
          )}
        </details>

        <details className="accounting-action-card demo-operation-disclosure">
          <summary>
            <span>Retiros de fondeo</span>
            <strong>{summary.fundingWithdrawals.length}</strong>
          </summary>
          <form className="summary-form" onSubmit={withdrawal}>
            <select defaultValue="" name="account" required>
              <option disabled value="">Cuenta</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.label}</option>
              ))}
            </select>
            <input defaultValue={today()} name="approved_on" required type="date" />
            <input inputMode="decimal" name="amount" placeholder="Importe aprobado" required />
            <button disabled={saving}>Registrar retiro</button>
          </form>
          {summary.fundingWithdrawals.length > 0 && (
            <div className="summary-list">
              {summary.fundingWithdrawals.map((item) => (
                <p key={item.id}>
                  <strong>{date(item.approvedOn)}</strong> · {money(item.amountInCents)}{item.phase ? ` · ${item.phase}` : ""} · {item.collectedOn ? (
                    `Cobrado el ${date(item.collectedOn)}`
                  ) : (
                    <button className="text-action" disabled={saving} onClick={() => collect(item.id)} type="button">
                      Confirmar cobro
                    </button>
                  )}
                </p>
              ))}
            </div>
          )}
        </details>
      </div>

      {message && <p className="register-feedback">{message}</p>}
    </section>
  );
}

function ConciliationCard({
  difference,
  leftLines,
  leftTitle,
  leftTotal,
  rightLines,
  rightTitle,
  rightTotal,
  title,
}: {
  difference: number;
  leftLines: Array<{ href: string; label: string; valueInCents: number | null }>;
  leftTitle: string;
  leftTotal: number;
  rightLines: Array<{ href: string; label: string; valueInCents: number | null }>;
  rightTitle: string;
  rightTotal: number;
  title: string;
}) {
  return (
    <article className="conciliation-card">
      <h4>{title}</h4>
      <div className="conciliation-sides">
        <ConciliationSide lines={leftLines} title={leftTitle} total={leftTotal} />
        <ConciliationSide lines={rightLines} title={rightTitle} total={rightTotal} />
      </div>
      <p className={`conciliation-difference${difference !== 0 ? " has-difference" : ""}`}>
        <span>Diferencia</span>
        <strong>{money(difference)}</strong>
      </p>
    </article>
  );
}

function ConciliationSide({
  lines,
  title,
  total,
}: {
  lines: Array<{ href: string; label: string; valueInCents: number | null }>;
  title: string;
  total: number;
}) {
  return (
    <div className="conciliation-side">
      <strong>{title}</strong>
      {lines.map((line) => (
        <p key={line.label}>
          <a href={line.href}>{line.label}</a>
          <span>{line.valueInCents === null ? "Sin saldo informado" : money(line.valueInCents)}</span>
        </p>
      ))}
      <footer>
        <span>Total</span>
        <strong>{money(total)}</strong>
      </footer>
    </div>
  );
}
