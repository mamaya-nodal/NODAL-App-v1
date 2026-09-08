"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { OperationalSummary } from "@/modules/summary/domain/operational-summary";

import { HomeOverview } from "../home-overview";

type AccountStage = "Evaluation" | "Funded" | "Live";
type AccountState = "active" | "closed" | "virgin";
type AccountFilter = "all" | AccountState | Lowercase<AccountStage>;

type DemoAccount = Readonly<{
  company: "Lucid" | "Tradeify";
  externalId: string;
  openedOn: string;
  period: "Agosto 2026" | "Julio 2026";
  resultInCents: number;
  stage: AccountStage;
  state: AccountState;
  trades: number;
}>;

const stageSequence: AccountStage[] = [
  "Evaluation", "Evaluation", "Funded", "Evaluation", "Live", "Funded",
];

const accounts: DemoAccount[] = Array.from({ length: 43 }, (_, index) => {
  const number = index + 1;
  const state: AccountState = number <= 34 ? "closed" : number === 43 ? "virgin" : "active";
  const company = number <= 28 ? "Lucid" : "Tradeify";
  const prefix = company === "Lucid" ? "LFE" : "TFY";
  const previousPeriod = number <= 18;
  return {
    company,
    externalId: `${prefix}${String(5088201070000 + number).padStart(13, "0")}`,
    openedOn: previousPeriod
      ? `${String(3 + (number % 21)).padStart(2, "0")}/07/2026`
      : `${String(2 + (number % 24)).padStart(2, "0")}/08/2026`,
    period: previousPeriod ? "Julio 2026" : "Agosto 2026",
    resultInCents: state === "virgin" ? 0 : ((number * 731) % 154000) - 51000,
    stage: state === "virgin" ? "Evaluation" : stageSequence[index % stageSequence.length],
    state,
    trades: state === "virgin" ? 0 : 1 + (number % 6),
  };
});

const demoSummary: OperationalSummary = {
  accountStates: { closed: 34, live: 8, virgin: 1 },
  brokerBalanceInCents: 445072,
  capitalNetInCents: 498000,
  commissionInCents: 224063,
  commissionRateLabel: "50%",
  floatingInCents: 184879,
  fundingCollectedInCents: 180000,
  fundingPendingInCents: 0,
  fundingWithdrawals: [
    { accountId: "demo-1", amountInCents: 180000, approvedOn: "2026-08-22", collectedOn: "2026-08-25", id: "demo-withdrawal" },
  ],
  manualAccountStateCount: 0,
  periodResultInCents: 854916,
  positionDifferenceInCents: 3582,
  positionExpectedInCents: 509952,
  positionObservableInCents: 513534,
  realizedGainInCents: 448126,
  realizedReconciliationDifferenceInCents: 0,
  traderGainInCents: 224063,
  virginPriceInCents: 10520,
  walletBalanceInCents: 180000,
  walletMovements: [],
};

const money = (cents: number) => new Intl.NumberFormat("es-AR", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
}).format(cents / 100);

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

function StageBadge({ stage }: Readonly<{ stage: AccountStage }>) {
  return <span className={`demo-stage ${stage.toLowerCase()}`}>{stage}</span>;
}

function AccountCard({ account, initiallyOpen = false }: Readonly<{ account: DemoAccount; initiallyOpen?: boolean }>) {
  return (
    <details className="demo-account-card" open={initiallyOpen}>
      <summary>
        <span className="demo-account-identity">
          <strong>{account.company} · Flex</strong>
          <small>{account.externalId}</small>
        </span>
        <StageBadge stage={account.stage} />
        <span className={`demo-account-result ${account.resultInCents < 0 ? "negative" : ""}`}>
          {account.state === "virgin" ? "Sin operar" : money(account.resultInCents)}
        </span>
        <i aria-hidden="true" />
      </summary>
      <div className="demo-account-detail">
        <div><span>Estado</span><strong>{account.state === "closed" ? "Cerrada" : account.state === "virgin" ? "Virgen" : "Activa"}</strong></div>
        <div><span>Período</span><strong>{account.period}</strong></div>
        <div><span>Inicio</span><strong>{account.openedOn}</strong></div>
        <div><span>Trades</span><strong>{account.trades}</strong></div>
        <div><span>Resultado</span><strong>{account.state === "virgin" ? "—" : money(account.resultInCents)}</strong></div>
      </div>
    </details>
  );
}

function AccountsDemo() {
  const [filter, setFilter] = useState<AccountFilter>("all");
  const [closedLimit, setClosedLimit] = useState(8);
  const filterCounts: Readonly<Record<AccountFilter, number>> = {
    active: accounts.filter((account) => account.state === "active").length,
    all: accounts.length,
    closed: accounts.filter((account) => account.state === "closed").length,
    evaluation: accounts.filter((account) => account.stage === "Evaluation").length,
    funded: accounts.filter((account) => account.stage === "Funded").length,
    live: accounts.filter((account) => account.stage === "Live").length,
    virgin: accounts.filter((account) => account.state === "virgin").length,
  };
  const visible = useMemo(() => accounts.filter((account) => {
    if (filter === "all") return true;
    if (["active", "closed", "virgin"].includes(filter)) return account.state === filter;
    return account.stage.toLowerCase() === filter;
  }), [filter]);
  const activeAccounts = visible.filter((account) => account.state === "active");
  const virginAccounts = visible.filter((account) => account.state === "virgin");
  const closedAccounts = visible.filter((account) => account.state === "closed");
  const invested = accounts.reduce((total) => total + 10520, 0);

  return (
    <section className="demo-view" id="cuentas" aria-label="Simulación de cuentas">
      <DemoHeading title="Cuentas" />

      <div className="demo-account-kpis">
        <article><span>Total</span><strong>43</strong></article>
        <article><span>Activas</span><strong>8</strong></article>
        <article><span>Virgen</span><strong>1</strong></article>
        <article><span>Invertido</span><strong>{money(invested)}</strong></article>
      </div>

      <div className="demo-filter-row" aria-label="Filtrar cuentas">
        {([
          ["all", "Todas"], ["active", "Activas"], ["evaluation", "Evaluation"],
          ["funded", "Funded"], ["live", "Live"], ["closed", "Cerradas"],
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
          <summary><span>Cuentas cerradas</span><strong>{closedAccounts.length} · 2 períodos</strong><i aria-hidden="true" /></summary>
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

const historyDays = [
  { date: "28 ago", result: 38210, operations: ["Lucid · Flex", "Tradeify · Flex", "Lucid · Flex"] },
  { date: "27 ago", result: -12640, operations: ["Tradeify · Flex", "Tradeify · Flex"] },
  { date: "26 ago", result: 61480, operations: ["Lucid · Flex", "Lucid · Flex", "Tradeify · Flex", "Lucid · Flex"] },
];

function OperationsDemo() {
  return (
    <section className="demo-view" id="operaciones" aria-label="Simulación de operaciones">
      <DemoHeading title="Operaciones" />

      <div className="demo-operation-grid">
        <article className="demo-live-operation">
          <div><span className="demo-live-dot" />En curso</div>
          <h3>Lucid · Flex</h3>
          <p>LFE0508820107042</p>
          <dl>
            <div><dt>Net liquidation</dt><dd>USD 4.476</dd></div>
            <div><dt>Cash value</dt><dd>USD 4.451</dd></div>
            <div><dt>Duración</dt><dd>08:42</dd></div>
          </dl>
        </article>
        <article className="demo-broker-balance"><span>Saldo broker</span><strong>USD 4.451</strong><small>Actualizado ahora</small></article>
        <article className="demo-today-result"><span>Resultado de hoy</span><strong>+USD 382</strong><small>3 operaciones cerradas</small></article>
      </div>

      <details className="demo-operation-disclosure">
        <summary><span>Revisar</span><strong>2</strong><i aria-hidden="true" /></summary>
        <div className="demo-review-list">
          <p><strong>Cuenta sin asignación</strong><span>Detectada hace 6 min</span></p>
          <p><strong>Cierre por confirmar</strong><span>Tradeify · Flex</span></p>
        </div>
      </details>

      <details className="demo-operation-disclosure">
        <summary><span>Asignación de cuentas</span><strong>9 cuentas</strong><i aria-hidden="true" /></summary>
        <div className="demo-assignment-map">
          <span>Broker principal</span><b>→</b><span>1 líder + 8 réplicas</span>
        </div>
      </details>

      <div className="demo-history">
        <div className="demo-group-title"><h3>Historial</h3><span>79</span></div>
        <details className="demo-period-history" open>
          <summary><span>Agosto 2026</span><small>48 operaciones</small><strong>USD 8.549</strong><i aria-hidden="true" /></summary>
          <div>
            {historyDays.map((day, dayIndex) => (
              <details className="demo-history-day" key={day.date} open={dayIndex === 0}>
                <summary>
                  <span>{day.date}</span>
                  <small>{day.operations.length} operaciones</small>
                  <strong className={day.result < 0 ? "negative" : ""}>{money(day.result)}</strong>
                  <i aria-hidden="true" />
                </summary>
                <div>
                  {day.operations.map((account, index) => (
                    <p key={`${day.date}-${index}`}><span>{account}</span><small>{`Operación ${48 - dayIndex * 5 - index}`}</small><strong>{money(Math.round(day.result / day.operations.length))}</strong></p>
                  ))}
                </div>
              </details>
            ))}
            <details className="demo-history-day">
              <summary><span>Resto de agosto</span><small>39 operaciones</small><strong>USD 7.869</strong><i aria-hidden="true" /></summary>
              <p className="demo-history-note">Se cargan por bloques al abrir.</p>
            </details>
          </div>
        </details>
        <details className="demo-period-history">
          <summary><span>Julio 2026</span><small>31 operaciones</small><strong>USD 3.264</strong><i aria-hidden="true" /></summary>
          <div className="demo-prior-period-summary">
            <p><span>Mejor día</span><strong>USD 1.180</strong></p>
            <p><span>Peor día</span><strong className="negative">-USD 861</strong></p>
            <p><span>Resultado neto</span><strong>USD 3.264</strong></p>
          </div>
        </details>
      </div>
    </section>
  );
}

function AccountingDemo() {
  return (
    <section className="demo-view" id="contabilidad" aria-label="Simulación de contabilidad">
      <DemoHeading title="Contabilidad" />
      <div className="demo-accounting-grid">
        <article className="demo-accounting-primary"><span>Resultado neto</span><strong>USD 8.549</strong><small>Agosto 2026</small></article>
        <article><span>Saldo broker</span><strong>USD 4.451</strong></article>
        <article><span>Saldo billeteras</span><strong>USD 1.800</strong></article>
        <article><span>Comisión de usuario</span><strong>USD 2.241</strong></article>
      </div>
      <div className="demo-periods-heading"><h3>Períodos</h3><span>2</span></div>
      <div className="demo-period-cards">
        <article className="current">
          <div><strong>Agosto 2026</strong><span>Actual</span></div>
          <dl><div><dt>Resultado</dt><dd>USD 8.549</dd></div><div><dt>Comisión</dt><dd>USD 2.241</dd></div><div><dt>Capital</dt><dd>USD 4.980</dd></div></dl>
        </article>
        <article>
          <div><strong>Julio 2026</strong><span>Cerrado</span></div>
          <dl><div><dt>Resultado</dt><dd>USD 3.264</dd></div><div><dt>Comisión</dt><dd>USD 1.632</dd></div><div><dt>Capital</dt><dd>USD 4.262</dd></div></dl>
        </article>
      </div>
      <details className="demo-operation-disclosure"><summary><span>Billeteras</span><strong>2</strong><i aria-hidden="true" /></summary><div className="demo-wallets"><p><span>Principal</span><strong>USD 1.250</strong></p><p><span>Secundaria</span><strong>USD 550</strong></p></div></details>
      <details className="demo-operation-disclosure"><summary><span>Conciliación</span><strong>Sin diferencias</strong><i aria-hidden="true" /></summary><div className="demo-wallets"><p><span>Posición esperada</span><strong>USD 5.100</strong></p><p><span>Posición observable</span><strong>USD 5.100</strong></p></div></details>
    </section>
  );
}

export function DemoAccountingWorkspace() {
  return (
    <>
      <HomeOverview
        capitalHistory={[
          { capitalInCents: 426200, periodMonth: "2026-07-01" },
          { capitalInCents: 498000, periodMonth: "2026-08-01" },
        ]}
        performance={{ averageInCents: 13740, bestInCents: 117968, worstInCents: -136148 }}
        periodLabel="Agosto 2026"
        summary={demoSummary}
      />
      <AccountsDemo />
      <OperationsDemo />
      <AccountingDemo />
    </>
  );
}
