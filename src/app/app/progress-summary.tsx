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
  periodId: string;
  summary: OperationalSummary;
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

function Card({
  alert = false,
  featured = false,
  label,
  value,
}: {
  alert?: boolean;
  featured?: boolean;
  label: string;
  value: string;
}) {
  return (
    <article
      className={`progress-card${featured ? " featured" : ""}${alert ? " alert-card" : ""}`}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function ProgressSummary({ accounts, embedded = false, periodId, summary }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const alerts = buildSummaryAlerts(summary);
  const conciliation = buildConciliationBreakdown(summary);
  const hasConciliationDifference =
    conciliation.capital.differenceInCents !== 0 ||
    conciliation.gains.differenceInCents !== 0;

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

      <Block title="Saldos">
        <Card
          featured
          label="Saldo broker"
          value={summary.brokerBalanceInCents === null ? "Sin saldo informado" : money(summary.brokerBalanceInCents)}
        />
        <Card label="Saldo billetera" value={money(summary.walletBalanceInCents)} />
        {summary.fundingPendingInCents > 0 && (
          <Card label="Retiros pendientes" value={money(summary.fundingPendingInCents)} />
        )}
      </Block>

      <Block title="Resultado">
        <Card label="Capital neto aportado" value={money(summary.capitalNetInCents)} />
        <Card featured label="Resultado del período" value={money(summary.periodResultInCents)} />
        <Card label="Ganancia realizada" value={money(summary.realizedGainInCents)} />
        <Card
          label={`Comisión de usuario (${summary.commissionRateLabel})`}
          value={money(summary.commissionInCents)}
        />
        <Card featured label="Ganancia del usuario" value={money(summary.traderGainInCents)} />
        {summary.positionDifferenceInCents !== 0 && (
          <Card alert label="Diferencia de capital" value={money(summary.positionDifferenceInCents)} />
        )}
      </Block>

      <details className="accounting-disclosure" open={hasConciliationDifference ? true : undefined}>
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
        <details className="accounting-action-card">
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

        <details className="accounting-action-card">
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

function Block({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="summary-section">
      <h3>{title}</h3>
      <div className="progress-primary-grid">{children}</div>
    </div>
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
