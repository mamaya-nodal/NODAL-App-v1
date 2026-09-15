"use client";

import { useMemo, useState } from "react";

import {
  calculateAccountResult,
  type AccountPhaseWithdrawal,
} from "@/modules/operations/domain/account-phase-results";
import {
  entriesForAccount,
  type OperationRegisterEntry,
} from "@/modules/operations/domain/operation-register";

import type { RegisterAccount } from "./operation-register";

type AccountFilter = "active" | "all" | "closed" | "evaluation" | "funded";

type Props = Readonly<{
  accounts: AccountOverviewAccount[];
  entries: OperationRegisterEntry[];
  withdrawals: AccountPhaseWithdrawal[];
}>;

export type AccountOverviewAccount = RegisterAccount & Readonly<{
  currentCashValueInCents: number | null;
  initialBalanceInCents: number | null;
  minimumNetLiquidationInCents: number | null;
  periodLabel: string;
  periodMonth: string;
  technicalTradeCount: number;
}>;

type AccountPresentation = Readonly<{
  account: AccountOverviewAccount;
  resultInCents: number | null;
  stage: "Evaluation" | "Funded";
  trades: number;
}>;

function money(cents: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(cents / 100);
}

function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))
    : "—";
}

function presentation(
  account: AccountOverviewAccount,
  entries: OperationRegisterEntry[],
  withdrawals: AccountPhaseWithdrawal[],
): AccountPresentation {
  const accountEntries = entriesForAccount(entries, account.id);
  const result = calculateAccountResult(
    accountEntries,
    withdrawals.filter((withdrawal) => withdrawal.accountId === account.id),
    account.stateOrigin,
    account.priceInCents ?? 0,
  );
  const activePhase = [...result.phaseResults].reverse().find((phase) =>
    phase.broker.entryCount > 0 || phase.totalWithdrawalInCents > 0,
  )?.phase ?? "Evaluacion";
  const latestResult = [...result.phaseResults].reverse().find(
    (phase) => phase.totalGainInCents !== 0,
  )?.totalGainInCents ?? 0;

  return {
    account,
    resultInCents: account.state === "virgin" || accountEntries.length === 0 ? null : latestResult,
    stage: activePhase === "Evaluacion" ? "Evaluation" : "Funded",
    trades: Math.max(
      new Set(accountEntries.map((entry) => entry.dailyControlId)).size,
      account.technicalTradeCount,
    ),
  };
}

function AccountCard({ item }: Readonly<{
  item: AccountPresentation;
}>) {
  const { account, resultInCents, stage, trades } = item;
  const state = account.state === "closed" ? "Cerrada" : account.state === "virgin" ? "Virgen" : "Activa";
  return (
    <details className="demo-account-card">
      <summary>
        <span className="demo-account-identity">
          <strong>{account.companyName}</strong>
          <small>{account.externalName ?? `Cuenta ${account.referenceNumber}`}</small>
        </span>
        <span className={`demo-stage ${stage.toLowerCase()}`}>{stage}</span>
        <span className="demo-account-balance">
          <small>Cash value</small>
          <strong>{account.currentCashValueInCents === null ? "—" : money(account.currentCashValueInCents)}</strong>
        </span>
        <span className={`demo-account-result${(resultInCents ?? 0) < 0 ? " negative" : ""}`}>
          {resultInCents === null
            ? account.state === "closed" ? "Cierre detectado" : "Sin operar"
            : money(resultInCents)}
        </span>
        <i aria-hidden="true" />
      </summary>
      <div className="demo-account-detail">
        <div><span>Estado</span><strong>{state}</strong></div>
        <div><span>Período</span><strong>{account.periodLabel}</strong></div>
        <div><span>Compra</span><strong>{date(account.purchasedOn)}</strong></div>
        <div><span>Trades</span><strong>{trades}</strong></div>
        <div><span>Capital inicial</span><strong>{account.initialBalanceInCents === null ? "—" : money(account.initialBalanceInCents)}</strong></div>
        <div><span>Cash value actual</span><strong>{account.currentCashValueInCents === null ? "—" : money(account.currentCashValueInCents)}</strong></div>
        {account.minimumNetLiquidationInCents !== null && (
          <div><span>Mínimo Net Liquidation</span><strong>{money(account.minimumNetLiquidationInCents)}</strong></div>
        )}
        <div><span>Variación prop</span><strong>{account.initialBalanceInCents === null || account.currentCashValueInCents === null ? "—" : money(account.currentCashValueInCents - account.initialBalanceInCents)}</strong></div>
        <div><span>Resultado contable</span><strong>{resultInCents === null ? account.state === "closed" ? "Pendiente" : "—" : money(resultInCents)}</strong></div>
      </div>
    </details>
  );
}

export function AccountsOverview({ accounts, entries, withdrawals }: Props) {
  const [filter, setFilter] = useState<AccountFilter>("all");
  const [closedLimit, setClosedLimit] = useState(8);
  const items = useMemo(
    () => accounts
      .map((account) => presentation(account, entries, withdrawals))
      .sort((left, right) =>
        right.account.periodMonth.localeCompare(left.account.periodMonth) ||
        left.account.companyName.localeCompare(right.account.companyName, "es") ||
        right.account.referenceNumber - left.account.referenceNumber,
      ),
    [accounts, entries, withdrawals],
  );
  const counts: Record<AccountFilter, number> = {
    active: items.filter((item) => item.account.state === "live").length,
    all: items.length,
    closed: items.filter((item) => item.account.state === "closed").length,
    evaluation: items.filter((item) => item.stage === "Evaluation").length,
    funded: items.filter((item) => item.stage === "Funded").length,
  };
  const visible = items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "active") return item.account.state === "live";
    if (filter === "closed") return item.account.state === "closed";
    return item.stage.toLowerCase() === filter;
  });
  const active = visible.filter((item) => item.account.state === "live");
  const virgin = visible.filter((item) => item.account.state === "virgin");
  const closed = visible.filter((item) => item.account.state === "closed");
  const closedPeriodCount = new Set(closed.map((item) => item.account.periodMonth)).size;
  const invested = accounts.reduce((total, account) => total + (account.priceInCents ?? 0), 0);

  return (
    <>
      <div className="demo-account-kpis">
        <article><span>Total</span><strong>{accounts.length}</strong></article>
        <article><span>Activas</span><strong>{counts.active}</strong></article>
        <article><span>Vírgenes</span><strong>{items.filter((item) => item.account.state === "virgin").length}</strong></article>
        <article><span>Invertido</span><strong>{money(invested)}</strong></article>
      </div>

      <div className="demo-filter-row" aria-label="Filtrar cuentas">
        {([
          ["all", "Todas"], ["active", "Activas"], ["evaluation", "Evaluation"],
          ["funded", "Funded"], ["closed", "Cerradas"],
        ] as const).map(([value, label]) => (
          <button
            aria-pressed={filter === value}
            key={value}
            onClick={() => { setFilter(value); setClosedLimit(8); }}
            type="button"
          >
            {label}<span>{counts[value]}</span>
          </button>
        ))}
      </div>

      {active.length > 0 && (
        <div className="demo-account-group">
          <div className="demo-group-title"><h3>En curso</h3><span>{active.length}</span></div>
          <div className="demo-account-list">
            {active.map((item) => <AccountCard item={item} key={item.account.id} />)}
          </div>
        </div>
      )}

      {virgin.length > 0 && (
        <div className="demo-account-group">
          <div className="demo-group-title"><h3>Sin operar</h3><span>{virgin.length}</span></div>
          <div className="demo-account-list">
            {virgin.map((item) => <AccountCard item={item} key={item.account.id} />)}
          </div>
        </div>
      )}

      {closed.length > 0 && (
        <details className="demo-closed-group" open={filter === "closed"}>
          <summary><span>Cuentas cerradas</span><strong>{closed.length} · {closedPeriodCount} {closedPeriodCount === 1 ? "período" : "períodos"}</strong><i aria-hidden="true" /></summary>
          <div className="demo-account-list">
            {closed.slice(0, closedLimit).map((item) => <AccountCard item={item} key={item.account.id} />)}
          </div>
          {closedLimit < closed.length && (
            <button className="demo-more" onClick={() => setClosedLimit((limit) => limit + 8)} type="button">
              Mostrar {Math.min(8, closed.length - closedLimit)} más
            </button>
          )}
        </details>
      )}

      {visible.length === 0 && <p className="empty-state">No hay cuentas para este filtro.</p>}
    </>
  );
}
