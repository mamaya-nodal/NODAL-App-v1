"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { HomeOverview } from "../home-overview";
import {
  augustDemo,
  calculatedAccountResult,
  currentDemoOperation,
  demoAccounts,
  demoCapitalHistory,
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
  const currentAccount = augustDemo.accounts.find((account) => account.id === currentDemoOperation.accountId) ?? augustDemo.accounts[0];
  const activeAccounts = augustDemo.accounts.filter((account) => account.state === "live").length;
  const operationCount = demoPeriods.reduce((total, period) => total + operationControls(period).length, 0);

  return (
    <section className="demo-view" id="operaciones" aria-label="Simulación de operaciones">
      <DemoHeading title="Operaciones" />

      <div className="demo-operation-grid">
        <article className="demo-live-operation">
          <div><span className="demo-live-dot" />En curso</div>
          <h3>{currentAccount.company} · Flex</h3>
          <p>{currentAccount.externalId}</p>
          <dl>
            <div><dt>Net liquidation</dt><dd>{money(currentDemoOperation.netLiquidationInCents)}</dd></div>
            <div><dt>Cash value</dt><dd>{money(currentDemoOperation.cashValueInCents)}</dd></div>
            <div><dt>Duración</dt><dd>{currentDemoOperation.duration}</dd></div>
          </dl>
        </article>
        <article className="demo-broker-balance"><span>Saldo broker</span><strong>{money(augustDemo.summary.brokerBalanceInCents)}</strong><small>Actualizado ahora</small></article>
        <article className="demo-today-result"><span>Resultado de hoy</span><strong>{signedMoney(latestDay.resultInCents)}</strong><small>{latestDay.controls.length} operaciones cerradas</small></article>
      </div>

      <details className="demo-operation-disclosure">
        <summary><span>Revisar</span><strong>2</strong><i aria-hidden="true" /></summary>
        <div className="demo-review-list">
          <p><strong>Cuenta sin asignación</strong><span>Detectada hace 6 min</span></p>
          <p><strong>Cierre por confirmar</strong><span>Tradeify · Flex</span></p>
        </div>
      </details>

      <details className="demo-operation-disclosure">
        <summary><span>Asignación de cuentas</span><strong>{activeAccounts + 1} cuentas</strong><i aria-hidden="true" /></summary>
        <div className="demo-assignment-map">
          <span>Broker principal</span><b>→</b><span>1 líder + {activeAccounts} réplicas</span>
        </div>
      </details>

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
