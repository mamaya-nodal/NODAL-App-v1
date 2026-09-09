"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import { HomeOverview } from "../home-overview";
import {
  applyDemoAccountingInputs,
  type DemoAccountingInput,
  type DemoAccountingInputKind,
} from "./demo-accounting-audit";
import {
  augustDemo,
  calculatedAccountResult,
  currentDemoBrokerCoverage,
  currentDemoOperations,
  demoAccounts,
  demoCapitalHistory,
  demoHomeDashboard,
  demoPeriods,
  julyDemo,
  type DemoAccount,
  type DemoAccountStage,
  type DemoControl,
  type DemoPeriod,
} from "./demo-fixture";

type AccountFilter = "active" | "all" | "closed" | "evaluation" | "funded" | "live-stage" | "virgin";

const money = (cents: number | null) => cents === null
  ? "—"
  : new Intl.NumberFormat("es-AR", {
      currency: "USD",
      maximumFractionDigits: 0,
      style: "currency",
    }).format(cents / 100);

const signedMoney = (cents: number) => `${cents > 0 ? "+" : ""}${money(cents)}`;

function operationControls(period: DemoPeriod) {
  return period.controls.filter((control): control is DemoControl & { operatingResultInCents: number } => (
    control.operatingResultInCents !== null
  ));
}

function operatingTotal(period: DemoPeriod) {
  return operationControls(period).reduce((total, control) => total + control.operatingResultInCents, 0);
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`))
    .replace(".", "");
}

function groupedDays(period: DemoPeriod) {
  const days = new Map<string, Array<DemoControl & { operatingResultInCents: number }>>();
  for (const control of operationControls(period)) {
    days.set(control.operatedOn, [...(days.get(control.operatedOn) ?? []), control]);
  }
  return [...days.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, controls]) => ({
      controls,
      date,
      resultInCents: controls.reduce((total, control) => total + control.operatingResultInCents, 0),
    }));
}

function DemoHeading({ title }: Readonly<{ title: string }>) {
  return (
    <div className="demo-heading">
      <h2>{title}</h2>
      <div>
        <span>Simulación · datos anónimos</span>
        <Link href="/app">Volver a datos reales</Link>
      </div>
    </div>
  );
}

function StageBadge({ stage }: Readonly<{ stage: DemoAccountStage }>) {
  return <span className={`demo-stage ${stage.toLowerCase()}`}>{stage}</span>;
}

function AccountCard({ account, initiallyOpen = false }: Readonly<{ account: DemoAccount; initiallyOpen?: boolean }>) {
  const period = account.periodLabel === augustDemo.label ? augustDemo : julyDemo;
  const resultInCents = account.state === "virgin" ? 0 : calculatedAccountResult(account, period);

  return (
    <details className="demo-account-card" open={initiallyOpen}>
      <summary>
        <span className="demo-account-identity">
          <strong>{account.company} · Flex</strong>
          <small>{account.externalId}</small>
        </span>
        <StageBadge stage={account.stage} />
        <span className={`demo-account-result ${resultInCents < 0 ? "negative" : ""}`}>
          {account.state === "virgin" ? "Sin operar" : money(resultInCents)}
        </span>
        <i aria-hidden="true" />
      </summary>
      <div className="demo-account-detail">
        <div><span>Estado</span><strong>{account.state === "closed" ? "Cerrada" : account.state === "virgin" ? "Virgen" : "Activa"}</strong></div>
        <div><span>Período</span><strong>{account.periodLabel}</strong></div>
        <div><span>Inicio</span><strong>{account.openedOn}</strong></div>
        <div><span>Trades</span><strong>{account.trades}</strong></div>
        <div><span>Resultado</span><strong>{account.state === "virgin" ? "—" : money(resultInCents)}</strong></div>
      </div>
    </details>
  );
}

function AccountsDemo() {
  const [filter, setFilter] = useState<AccountFilter>("all");
  const [closedLimit, setClosedLimit] = useState(8);
  const filterCounts: Readonly<Record<AccountFilter, number>> = {
    active: demoAccounts.filter((account) => account.state === "live").length,
    all: demoAccounts.length,
    closed: demoAccounts.filter((account) => account.state === "closed").length,
    evaluation: demoAccounts.filter((account) => account.stage === "Evaluation").length,
    funded: demoAccounts.filter((account) => account.stage === "Funded").length,
    "live-stage": demoAccounts.filter((account) => account.stage === "Live").length,
    virgin: demoAccounts.filter((account) => account.state === "virgin").length,
  };
  const visible = useMemo(() => demoAccounts.filter((account) => {
    if (filter === "all") return true;
    if (filter === "active") return account.state === "live";
    if (filter === "closed" || filter === "virgin") return account.state === filter;
    if (filter === "live-stage") return account.stage === "Live";
    return account.stage.toLowerCase() === filter;
  }), [filter]);
  const activeAccounts = visible.filter((account) => account.state === "live");
  const virginAccounts = visible.filter((account) => account.state === "virgin");
  const closedAccounts = visible.filter((account) => account.state === "closed");
  const invested = demoAccounts.reduce((total, account) => total + account.priceInCents, 0);

  return (
    <section className="demo-view" id="cuentas" aria-label="Simulación de cuentas">
      <DemoHeading title="Cuentas" />

      <div className="demo-account-kpis">
        <article><span>Total</span><strong>{demoAccounts.length}</strong></article>
        <article><span>Activas</span><strong>{filterCounts.active}</strong></article>
        <article><span>Virgen</span><strong>{filterCounts.virgin}</strong></article>
        <article><span>Invertido</span><strong>{money(invested)}</strong></article>
      </div>

      <div className="demo-filter-row" aria-label="Filtrar cuentas">
        {([
          ["all", "Todas"], ["active", "Activas"], ["evaluation", "Evaluation"],
          ["funded", "Funded"], ["live-stage", "Live"], ["closed", "Cerradas"],
        ] as const).map(([value, label]) => (
          <button aria-pressed={filter === value} key={value} onClick={() => { setFilter(value); setClosedLimit(8); }} type="button">
            {label}<span>{filterCounts[value]}</span>
          </button>
        ))}
      </div>

      {activeAccounts.length > 0 && (
        <div className="demo-account-group">
          <div className="demo-group-title"><h3>En curso</h3><span>{activeAccounts.length}</span></div>
          <div className="demo-account-list">
            {activeAccounts.map((account, index) => <AccountCard account={account} initiallyOpen={filter === "all" && index === 0} key={account.externalId} />)}
          </div>
        </div>
      )}

      {virginAccounts.length > 0 && (
        <div className="demo-account-group">
          <div className="demo-group-title"><h3>Sin operar</h3><span>{virginAccounts.length}</span></div>
          <div className="demo-account-list">
            {virginAccounts.map((account) => <AccountCard account={account} key={account.externalId} />)}
          </div>
        </div>
      )}

      {closedAccounts.length > 0 && (
        <details className="demo-closed-group" open={filter === "closed"}>
          <summary><span>Cuentas cerradas</span><strong>{closedAccounts.length} · {demoPeriods.length} períodos</strong><i aria-hidden="true" /></summary>
          <div className="demo-account-list">
            {closedAccounts.slice(0, closedLimit).map((account) => <AccountCard account={account} key={account.externalId} />)}
          </div>
          {closedLimit < closedAccounts.length && (
            <button className="demo-more" onClick={() => setClosedLimit((limit) => limit + 8)} type="button">
              Mostrar {Math.min(8, closedAccounts.length - closedLimit)} más
            </button>
          )}
        </details>
      )}
    </section>
  );
}

function PeriodHistory({ period, initiallyOpen = false }: Readonly<{ period: DemoPeriod; initiallyOpen?: boolean }>) {
  const days = groupedDays(period);
  const visibleDays = period.id === "august" ? days.slice(0, 3) : [];
  const remainingDays = days.slice(visibleDays.length);
  const remainingControls = remainingDays.flatMap((day) => day.controls);
  const remainingResult = remainingControls.reduce((total, control) => total + control.operatingResultInCents, 0);

  return (
    <details className="demo-period-history" open={initiallyOpen}>
      <summary>
        <span>{period.label}</span>
        <small>{operationControls(period).length} operaciones</small>
        <strong>{money(period.summary.periodResultInCents)}</strong>
        <i aria-hidden="true" />
      </summary>
      {period.id === "august" ? (
        <div>
          {visibleDays.map((day, dayIndex) => (
            <details className="demo-history-day" key={day.date} open={dayIndex === 0}>
              <summary>
                <span>{dayLabel(day.date)}</span>
                <small>{day.controls.length} operaciones</small>
                <strong className={day.resultInCents < 0 ? "negative" : ""}>{signedMoney(day.resultInCents)}</strong>
                <i aria-hidden="true" />
              </summary>
              <div>
                {day.controls.map((control) => {
                  const account = period.accounts[(control.controlNumber - 1) % period.accounts.length];
                  return (
                    <p key={control.id}>
                      <span>{account.company} · Flex</span>
                      <small>{account.externalId}</small>
                      <strong className={control.operatingResultInCents < 0 ? "negative" : ""}>{signedMoney(control.operatingResultInCents)}</strong>
                    </p>
                  );
                })}
              </div>
            </details>
          ))}
          {remainingControls.length > 0 && (
            <details className="demo-history-day">
              <summary>
                <span>Resto de agosto</span>
                <small>{remainingControls.length} operaciones</small>
                <strong className={remainingResult < 0 ? "negative" : ""}>{signedMoney(remainingResult)}</strong>
                <i aria-hidden="true" />
              </summary>
              <p className="demo-history-note">Se cargan por bloques al abrir.</p>
            </details>
          )}
        </div>
      ) : (
        <div className="demo-prior-period-summary">
          <p><span>Mejor día</span><strong>{money(period.performance.bestInCents)}</strong></p>
          <p><span>Peor día</span><strong className="negative">{money(period.performance.worstInCents)}</strong></p>
          <p><span>Resultado broker</span><strong>{money(operatingTotal(period))}</strong></p>
        </div>
      )}
    </details>
  );
}

function OperationsDemo() {
  const augustDays = groupedDays(augustDemo);
  const latestDay = augustDays[0];
  const operationCount = demoPeriods.reduce((total, period) => total + operationControls(period).length, 0);
  const currentOperations = currentDemoOperations.flatMap((operation) => {
    const account = augustDemo.accounts.find((candidate) => candidate.id === operation.accountId);
    return account ? [{ account, operation }] : [];
  });
  const brokerFloatingInCents = currentDemoBrokerCoverage.netLiquidationInCents - currentDemoBrokerCoverage.cashValueInCents;

  return (
    <section className="demo-view" id="operaciones" aria-label="Simulación de operaciones">
      <DemoHeading title="Operaciones" />

      <div className="demo-operation-grid">
        <article className="demo-broker-balance"><span>Cuentas prop en curso</span><strong>{currentOperations.length}</strong><small>Long · {currentDemoBrokerCoverage.instrument}</small></article>
        <article className="demo-broker-balance"><span>Cobertura broker</span><strong className="positive">{signedMoney(brokerFloatingInCents)}</strong><small>Short · {currentDemoBrokerCoverage.quantity} {currentDemoBrokerCoverage.instrument}</small></article>
        <article className="demo-today-result"><span>Resultado de hoy</span><strong>{signedMoney(latestDay.resultInCents)}</strong><small>{latestDay.controls.length} operaciones cerradas</small></article>
      </div>

      <article className="demo-coverage-operation">
        <div>
          <span className="demo-live-dot" />
          <strong>Operación sincronizada</strong>
        </div>
        <p><span>{currentOperations.length} cuentas prop</span><b>Long · 1 {currentDemoBrokerCoverage.instrument} cada una</b></p>
        <i aria-hidden="true">↔</i>
        <p><span>{currentDemoBrokerCoverage.accountName}</span><b>Short · {currentDemoBrokerCoverage.quantity} {currentDemoBrokerCoverage.instrument}</b></p>
      </article>

      <div className="demo-group-title demo-live-title"><h3>Cuentas prop</h3><span>{currentOperations.length}</span></div>
      <div className="demo-live-operations">
        {currentOperations.map(({ account, operation }) => (
          <article className="demo-live-operation" key={account.id}>
            <div><span className="demo-live-dot" />En curso</div>
            <h3>{account.company} · Flex</h3>
            <p>{account.externalId}</p>
            <dl>
              <div><dt>Posición</dt><dd>{operation.direction} · {operation.quantity} {operation.instrument}</dd></div>
              <div><dt>Net liquidation</dt><dd>{money(operation.netLiquidationInCents)}</dd></div>
              <div><dt>Cash value</dt><dd>{money(operation.cashValueInCents)}</dd></div>
              <div><dt>Duración</dt><dd>{operation.duration}</dd></div>
            </dl>
          </article>
        ))}
      </div>

      <div className="demo-group-title demo-live-title"><h3>Cobertura</h3><span>1</span></div>
      <article className="demo-live-operation demo-broker-operation">
        <div><span className="demo-live-dot" />En curso</div>
        <h3>{currentDemoBrokerCoverage.accountName}</h3>
        <p>Resultado flotante {signedMoney(brokerFloatingInCents)}</p>
        <dl>
          <div><dt>Posición</dt><dd>{currentDemoBrokerCoverage.direction} · {currentDemoBrokerCoverage.quantity} {currentDemoBrokerCoverage.instrument}</dd></div>
          <div><dt>Net liquidation</dt><dd>{money(currentDemoBrokerCoverage.netLiquidationInCents)}</dd></div>
          <div><dt>Cash value</dt><dd>{money(currentDemoBrokerCoverage.cashValueInCents)}</dd></div>
          <div><dt>Duración</dt><dd>{currentDemoBrokerCoverage.duration}</dd></div>
        </dl>
      </article>

      <div className="demo-history">
        <div className="demo-group-title"><h3>Historial</h3><span>{operationCount}</span></div>
        <PeriodHistory initiallyOpen period={augustDemo} />
        <PeriodHistory period={julyDemo} />
      </div>
    </section>
  );
}

function PeriodCard({ current, period }: Readonly<{ current?: boolean; period: DemoPeriod }>) {
  return (
    <article className={current ? "current" : undefined}>
      <div><strong>{period.label}</strong><span>{current ? "Actual" : "Cerrado"}</span></div>
      <dl>
        <div><dt>Facturación</dt><dd>{money(period.summary.realizedGainInCents)}</dd></div>
        <div><dt>Comisión</dt><dd>{money(period.summary.commissionInCents)}</dd></div>
        <div><dt>Ganancia usuario</dt><dd>{money(period.summary.traderGainInCents)}</dd></div>
        <div><dt>Resultado período</dt><dd>{money(period.summary.periodResultInCents)}</dd></div>
      </dl>
    </article>
  );
}

const auditInputLabels: Record<DemoAccountingInputKind, string> = {
  account_purchase_external: "Compra de cuenta · aporte",
  account_purchase_generated: "Compra de cuenta · saldo generado",
  broker_deposit_external: "Depósito broker · aporte",
  broker_deposit_wallet: "Depósito broker · billetera",
  broker_withdrawal_personal: "Retiro broker · personal",
  broker_withdrawal_wallet: "Retiro broker · billetera",
  operation_result: "Resultado de operación",
  payout_approved: "Payout aprobado",
  payout_collected: "Payout cobrado",
  wallet_contribution: "Aporte a billetera",
  wallet_withdrawal: "Retiro de billetera",
};

const amountlessAuditInputs = new Set<DemoAccountingInputKind>(["payout_collected"]);
const accountAuditInputs = new Set<DemoAccountingInputKind>(["operation_result", "payout_approved"]);

function parseAuditAmount(value: string, signed: boolean) {
  const normalized = value.trim().replace(",", ".");
  const pattern = signed ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/;
  if (!pattern.test(normalized)) throw new Error("Ingresá un importe válido con hasta dos decimales.");
  const amountInCents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(amountInCents) || (!signed && amountInCents <= 0) || (signed && amountInCents === 0)) {
    throw new Error("El importe debe ser distinto de cero.");
  }
  return amountInCents;
}

function AccountingAudit() {
  const [inputs, setInputs] = useState<DemoAccountingInput[]>([]);
  const [periodId, setPeriodId] = useState<DemoPeriod["id"]>("august");
  const [kind, setKind] = useState<DemoAccountingInputKind>("operation_result");
  const [amount, setAmount] = useState("100");
  const [accountId, setAccountId] = useState("");
  const [payoutId, setPayoutId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const baseline = periodId === "august" ? augustDemo : julyDemo;
  const current = useMemo(
    () => applyDemoAccountingInputs(baseline, inputs.filter((input) => input.id.startsWith(`${periodId}-`))),
    [baseline, inputs, periodId],
  );
  const pendingPayouts = current.fundingWithdrawals.filter((withdrawal) => !withdrawal.collectedOn);
  const requiresAccount = accountAuditInputs.has(kind);
  const requiresAmount = !amountlessAuditInputs.has(kind);
  const operationAccounts = current.accounts.filter((account) => account.state === "live");
  const payoutAccounts = current.accounts.filter((account) => account.state === "closed" && account.stage !== "Evaluation");
  const selectableAccounts = kind === "operation_result" ? operationAccounts : payoutAccounts;
  const metrics = [
    ["Saldo broker", current.summary.brokerBalanceInCents, baseline.summary.brokerBalanceInCents],
    ["Saldo billetera", current.summary.walletBalanceInCents, baseline.summary.walletBalanceInCents],
    ["Payouts pendientes", current.summary.fundingPendingInCents, baseline.summary.fundingPendingInCents],
    ["Capital neto aportado", current.summary.capitalNetInCents, baseline.summary.capitalNetInCents],
    ["Resultado del período", current.summary.periodResultInCents, baseline.summary.periodResultInCents],
    ["Flotante", current.summary.floatingInCents, baseline.summary.floatingInCents],
    ["Ganancia realizada", current.summary.realizedGainInCents, baseline.summary.realizedGainInCents],
    ["Comisión de usuario", current.summary.commissionInCents, baseline.summary.commissionInCents],
    ["Ganancia del usuario", current.summary.traderGainInCents, baseline.summary.traderGainInCents],
    ["Diferencia de capital", current.summary.positionDifferenceInCents, baseline.summary.positionDifferenceInCents],
    ["Diferencia de ganancias", current.summary.realizedReconciliationDifferenceInCents, baseline.summary.realizedReconciliationDifferenceInCents],
  ] as const;

  function addInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const selectedPayout = kind === "payout_collected"
        ? pendingPayouts.find((withdrawal) => withdrawal.id === payoutId)
        : null;
      if (requiresAccount && !selectableAccounts.some((account) => account.id === accountId)) {
        throw new Error("Elegí la cuenta afectada.");
      }
      if (kind === "payout_collected" && !selectedPayout) throw new Error("Elegí el payout cobrado.");
      const amountInCents = requiresAmount
        ? parseAuditAmount(amount, kind === "operation_result")
        : selectedPayout?.amountInCents ?? 0;
      const next: DemoAccountingInput = {
        accountId: requiresAccount ? accountId : undefined,
        amountInCents,
        id: `${periodId}-audit-${inputs.length + 1}`,
        kind,
        payoutId: selectedPayout?.id,
      };
      applyDemoAccountingInputs(current, [next]);
      setInputs((existing) => [...existing, next]);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo aplicar el movimiento.");
    }
  }

  const periodInputs = inputs.filter((input) => input.id.startsWith(`${periodId}-`));

  return (
    <section className="demo-audit">
      <div className="demo-audit-heading">
        <h3>Prueba contable</h3>
        <div>
          <button aria-pressed={periodId === "july"} onClick={() => setPeriodId("july")} type="button">Julio</button>
          <button aria-pressed={periodId === "august"} onClick={() => setPeriodId("august")} type="button">Agosto</button>
        </div>
      </div>

      <form className="demo-audit-form" onSubmit={addInput}>
        <select aria-label="Tipo de entrada" onChange={(event) => { setKind(event.target.value as DemoAccountingInputKind); setError(null); }} value={kind}>
          {Object.entries(auditInputLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {requiresAccount && (
          <select aria-label="Cuenta" onChange={(event) => setAccountId(event.target.value)} required value={accountId}>
            <option value="">Cuenta</option>
            {selectableAccounts.map((account) => <option key={account.id} value={account.id}>{account.externalId}</option>)}
          </select>
        )}
        {kind === "payout_collected" && (
          <select aria-label="Payout pendiente" onChange={(event) => setPayoutId(event.target.value)} required value={payoutId}>
            <option value="">Payout pendiente</option>
            {pendingPayouts.map((withdrawal) => {
              const account = current.accounts.find((candidate) => candidate.id === withdrawal.accountId);
              return <option key={withdrawal.id} value={withdrawal.id}>{account?.externalId ?? "Cuenta"} · {money(withdrawal.amountInCents)}</option>;
            })}
          </select>
        )}
        {requiresAmount && <input aria-label="Importe en USD" inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="Importe USD" required value={amount} />}
        <button className="primary-action" type="submit">Aplicar</button>
      </form>
      {error && <p className="demo-audit-error" role="alert">{error}</p>}

      <div className="demo-audit-metrics">
        {metrics.map(([label, value, original]) => {
          const delta = (value ?? 0) - (original ?? 0);
          return (
            <article className={label.startsWith("Diferencia") && value !== 0 ? "alert" : undefined} key={label}>
              <span>{label}</span>
              <strong>{money(value)}</strong>
              <small className={delta < 0 ? "negative" : delta > 0 ? "positive" : undefined}>{delta === 0 ? "Sin cambio" : `${delta > 0 ? "+" : ""}${money(delta)}`}</small>
            </article>
          );
        })}
      </div>

      <div className="demo-audit-log">
        <div><strong>Entradas aplicadas</strong><button className="text-action" disabled={periodInputs.length === 0} onClick={() => setInputs((existing) => existing.filter((input) => !input.id.startsWith(`${periodId}-`)))} type="button">Restablecer</button></div>
        {periodInputs.length === 0 ? <p>Escenario original</p> : periodInputs.map((input) => {
          const account = current.accounts.find((candidate) => candidate.id === input.accountId);
          return <p key={input.id}><span>{auditInputLabels[input.kind]}{account ? ` · ${account.externalId}` : ""}</span><strong>{money(input.amountInCents)}</strong></p>;
        })}
      </div>
    </section>
  );
}

function AccountingDemo() {
  const summary = augustDemo.summary;
  return (
    <section className="demo-view" id="contabilidad" aria-label="Simulación de contabilidad">
      <DemoHeading title="Contabilidad" />
      <div className="demo-accounting-grid">
        <article className="demo-accounting-primary"><span>Facturación</span><strong>{money(summary.realizedGainInCents)}</strong><small>{augustDemo.label}</small></article>
        <article><span>Resultado del período</span><strong>{money(summary.periodResultInCents)}</strong></article>
        <article><span>Saldo broker</span><strong>{money(summary.brokerBalanceInCents)}</strong></article>
        <article><span>Comisión de usuario</span><strong>{money(summary.commissionInCents)}</strong><small>{summary.commissionRateLabel}</small></article>
        <article><span>Ganancia del usuario</span><strong>{money(summary.traderGainInCents)}</strong></article>
      </div>
      <div className="demo-periods-heading"><h3>Períodos</h3><span>{demoPeriods.length}</span></div>
      <div className="demo-period-cards">
        <PeriodCard current period={augustDemo} />
        <PeriodCard period={julyDemo} />
      </div>
      <AccountingAudit />
      <details className="demo-operation-disclosure">
        <summary><span>Retiros</span><strong>{summary.fundingWithdrawals.length}</strong><i aria-hidden="true" /></summary>
        <div className="demo-wallets">
          {summary.fundingWithdrawals.map((withdrawal) => (
            <p key={withdrawal.id}>
              <span>{withdrawal.collectedOn ? "Cobrado" : "Pendiente"}</span>
              <strong>{money(withdrawal.amountInCents)}</strong>
            </p>
          ))}
          <p><span>Saldo billetera</span><strong>{money(summary.walletBalanceInCents)}</strong></p>
        </div>
      </details>
      <details className="demo-operation-disclosure">
        <summary><span>Conciliación</span><strong>{summary.positionDifferenceInCents === 0 ? "Sin diferencias" : money(summary.positionDifferenceInCents)}</strong><i aria-hidden="true" /></summary>
        <div className="demo-wallets">
          <p><span>Posición esperada</span><strong>{money(summary.positionExpectedInCents)}</strong></p>
          <p><span>Posición observable</span><strong>{money(summary.positionObservableInCents)}</strong></p>
          <p><span>Facturación conciliada</span><strong>{summary.realizedReconciliationDifferenceInCents === 0 ? "Sin diferencias" : money(summary.realizedReconciliationDifferenceInCents)}</strong></p>
        </div>
      </details>
    </section>
  );
}

export function DemoAccountingWorkspace() {
  return (
    <>
      <HomeOverview
        capitalHistory={demoCapitalHistory}
        dashboard={demoHomeDashboard}
        performance={augustDemo.performance}
        periodLabel={augustDemo.label}
        summary={augustDemo.summary}
      />
      <AccountsDemo />
      <OperationsDemo />
      <AccountingDemo />
    </>
  );
}
