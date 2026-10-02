"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  calculateAccountResult,
  type AccountPhaseWithdrawal,
} from "@/modules/operations/domain/account-phase-results";
import { ACCOUNT_PHASES } from "@/modules/operations/domain/account-detail";
import {
  entriesForAccount,
  type OperationRegisterEntry,
} from "@/modules/operations/domain/operation-register";
import {
  accountProgressLabel,
  resolveCurrentAccountProgress,
  type AccountOperationalState,
  type ApprovedAccountPayout,
} from "@/modules/operations/domain/account-progress";

import type { RegisterAccount } from "./operation-register";
import { deleteRegisteredAccount, updateRegisteredAccountPurchase } from "./purchase-actions";

type AccountFilter = "active" | "all" | "closed" | "evaluation" | "funded" | "operational-live";

type Props = Readonly<{
  accounts: AccountOverviewAccount[];
  entries: OperationRegisterEntry[];
  payouts: AccountOverviewPayout[];
  wallets: PurchaseWalletOption[];
  withdrawals: AccountPhaseWithdrawal[];
}>;

type PurchaseWalletOption = Readonly<{
  balanceInCents: number;
  id: string;
  name: string;
}>;

export type AccountOverviewAccount = RegisterAccount & Readonly<{
  canDelete?: boolean;
  canEditPurchase?: boolean;
  currentCashValueInCents: number | null;
  currentOperationalState: AccountOperationalState | null;
  initialBalanceInCents: number | null;
  minimumNetLiquidationInCents: number | null;
  ninjaConnectionName: string | null;
  periodLabel: string;
  periodMonth: string;
  purchaseWalletId: string | null;
  technicalTradeCount: number;
  economicHistory?: AccountEconomicHistoryRow[];
}>;

export type AccountEconomicHistoryRow = Readonly<{
  accumulatedInCents: number;
  brokerResultInCents: number | null;
  concept: "Cobertura" | "Examen" | "Payout";
  phase: string;
  propResultInCents: number | null;
  tradeNumber: number | null;
}>;

type AccountPresentation = Readonly<{
  account: AccountOverviewAccount;
  operationalState: AccountOperationalState;
  payouts: AccountOverviewPayout[];
  progress: ReturnType<typeof resolveCurrentAccountProgress>;
  resultInCents: number | null;
  trades: number;
}>;

export type AccountOverviewPayout = ApprovedAccountPayout & Readonly<{
  accountId: string;
  amountInCents: number;
  approvedOn: string;
  id: string;
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
  payouts: AccountOverviewPayout[],
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

  const operationalState = account.currentOperationalState
    ?? (activePhase === "Evaluacion" ? "Evaluation" : "Funded");
  const accountPayouts = payouts.filter((payout) => payout.accountId === account.id);
  return {
    account,
    operationalState,
    progress: resolveCurrentAccountProgress({
      entries: accountEntries,
      observedClosedTradeCount: account.technicalTradeCount,
      operationalState,
      payouts: accountPayouts,
    }),
    payouts: accountPayouts,
    resultInCents: account.state === "virgin" || accountEntries.length === 0 ? null : latestResult,
    trades: Math.max(
      new Set(accountEntries.map((entry) => entry.dailyControlId)).size,
      account.technicalTradeCount,
    ),
  };
}

function phaseLabel(phaseIndex: number): string {
  return phaseIndex === 0 ? "Evaluación" : `${phaseIndex}.ª vuelta`;
}

function AccountPhaseProgress({ item }: Readonly<{ item: AccountPresentation }>) {
  const currentIndex = ACCOUNT_PHASES.indexOf(item.progress.phase);

  return (
    <section className="account-phase-progress" aria-label={`Progreso de ${item.account.externalName ?? `Cuenta ${item.account.referenceNumber}`}`}>
      <div className="account-phase-progress-heading">
        <strong>Progreso operativo</strong>
        <span>{accountProgressLabel(item.progress)}</span>
      </div>
      <ol className="account-phase-track">
        {ACCOUNT_PHASES.map((phase, phaseIndex) => {
          const payout = item.payouts.find((candidate) => candidate.phase === phase);
          const evaluationCompleted = phase === "Evaluacion" && currentIndex > 0;
          const completed = evaluationCompleted || Boolean(payout) || phaseIndex < currentIndex;
          const current = phaseIndex === currentIndex && !payout;
          const detail = payout
            ? `Payout ${money(payout.amountInCents)} aprobado el ${date(payout.approvedOn)}`
            : evaluationCompleted
              ? "Evaluación aprobada"
              : current
                ? accountProgressLabel(item.progress)
                : "Pendiente";

          return (
            <li className={`${completed ? "is-complete" : ""}${current ? " is-current" : ""}`} key={phase} title={detail}>
              <span className="account-phase-line" aria-hidden="true" />
              <span className="account-phase-node" aria-hidden="true">{completed ? "✓" : current ? item.progress.tradeDay : ""}</span>
              <strong>{phaseLabel(phaseIndex)}</strong>
              <small>{payout ? `Payout · ${date(payout.approvedOn)}` : evaluationCompleted ? "Aprobada" : current ? `Día ${item.progress.tradeDay}` : "Pendiente"}</small>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function AccountCard({ item, wallets }: Readonly<{
  item: AccountPresentation;
  wallets: readonly PurchaseWalletOption[];
}>) {
  const router = useRouter();
  const { account, operationalState, progress, resultInCents, trades } = item;
  const [actionMode, setActionMode] = useState<"delete" | "edit" | null>(null);
  const [fundsOrigin, setFundsOrigin] = useState<"Aporte trader" | "Saldo generado">(
    account.fundsOrigin === "Saldo generado" ? "Saldo generado" : "Aporte trader",
  );
  const [price, setPrice] = useState(String((account.priceInCents ?? 0) / 100));
  const [walletId, setWalletId] = useState(account.purchaseWalletId ?? "");
  const [working, setWorking] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const state = account.state === "closed" ? "Cerrada" : account.state === "virgin" ? "Virgen" : "Viva";
  return (
    <details className="demo-account-card">
      <summary>
        <span className="demo-account-identity">
          <strong>{account.companyName}</strong>
          <span className="demo-account-reference">
            <small>{account.externalName ?? `Cuenta ${account.referenceNumber}`}</small>
            <b aria-hidden="true">|</b>
            <em>{accountProgressLabel(progress)}</em>
          </span>
          {account.ninjaConnectionName && <small className="demo-account-connection">{account.ninjaConnectionName}</small>}
        </span>
        <span className={`demo-stage ${operationalState.toLowerCase()}`}>{operationalState}</span>
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
        <div><span>Estado contable</span><strong>{state}</strong></div>
        <div><span>Estado operativo</span><strong>{operationalState}</strong></div>
        <div><span>Fase y próximo trade</span><strong>{accountProgressLabel(progress)}</strong></div>
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
      <AccountPhaseProgress item={item} />
      {(account.canEditPurchase || account.canDelete) && (
        <div className="manual-account-management">
          {actionMode === null && (
            <div className="manual-account-actions">
              {account.canEditPurchase && (
                <button className="edit" onClick={() => {
                  setFundsOrigin(account.fundsOrigin === "Saldo generado" ? "Saldo generado" : "Aporte trader");
                  setPrice(String((account.priceInCents ?? 0) / 100));
                  setWalletId(account.purchaseWalletId ?? "");
                  setActionMessage(null);
                  setActionMode("edit");
                }} type="button">Editar registro</button>
              )}
              {account.canDelete && (
                <button className="delete" onClick={() => {
                  setActionMessage(null);
                  setActionMode("delete");
                }} type="button"><span aria-hidden="true">×</span> Eliminar registro</button>
              )}
            </div>
          )}

          {actionMode === "edit" && (
            <form className="manual-account-edit" onSubmit={async (event) => {
              event.preventDefault();
              if (working) return;
              setWorking(true);
              setActionMessage(null);
              const result = await updateRegisteredAccountPurchase({
                accountId: account.id,
                fundsOrigin,
                price,
                walletId: walletId || null,
              });
              setWorking(false);
              setActionMessage(result.message);
              if (result.ok) {
                setActionMode(null);
                router.refresh();
              }
            }}>
              <label>Costo (USD)
                <input min="0" onChange={(event) => setPrice(event.target.value)} required step="0.01" type="number" value={price} />
              </label>
              <label>Origen de fondos
                <select onChange={(event) => setFundsOrigin(event.target.value as typeof fundsOrigin)} value={fundsOrigin}>
                  <option value="Aporte trader">Aporte nuevo del trader</option>
                  <option disabled={wallets.length === 0} value="Saldo generado">Desde una billetera</option>
                </select>
              </label>
              {fundsOrigin === "Saldo generado" && (
                <label>Billetera
                  <select onChange={(event) => setWalletId(event.target.value)} required value={walletId}>
                    <option disabled value="">Elegí una billetera</option>
                    {wallets.map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>{wallet.name} · disponible {money(wallet.balanceInCents)}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="manual-account-edit-actions">
                <button className="cancel" disabled={working} onClick={() => setActionMode(null)} type="button">Cancelar</button>
                <button className="save" disabled={working} type="submit">{working ? "Guardando…" : "Guardar cambios"}</button>
              </div>
            </form>
          )}

          {actionMode === "delete" && (
            <div aria-labelledby={`delete-account-${account.id}`} aria-modal="true" className="manual-account-delete-confirm" role="alertdialog">
              <strong id={`delete-account-${account.id}`}>¿Eliminar este registro?</strong>
              <p>La cuenta desaparecerá de la app y el conector no volverá a detectarla ni ofrecerla para registrar.</p>
              <div>
                <button className="cancel" disabled={working} onClick={() => setActionMode(null)} type="button">Cancelar</button>
                <button className="confirm-delete" disabled={working} onClick={async () => {
                  setWorking(true);
                  setActionMessage(null);
                  const result = await deleteRegisteredAccount(account.id);
                  setWorking(false);
                  setActionMessage(result.message);
                  if (result.ok) router.refresh();
                }} type="button">{working ? "Eliminando…" : "Eliminar definitivamente"}</button>
              </div>
            </div>
          )}

          {actionMessage && <small className="manual-account-message">{actionMessage}</small>}
        </div>
      )}
      {(account.economicHistory?.length ?? 0) > 0 && (
        <div className="account-economic-history">
          <div className="account-economic-history-head"><span>N° trade</span><span>Etapa</span><span>Resultado prop</span><span>Resultado broker</span><span>Acumulado</span><span>Concepto</span></div>
          {account.economicHistory!.map((row, index) => (
            <div className="account-economic-history-row" key={`${row.concept}-${row.tradeNumber ?? 0}-${index}`}>
              <span>{row.tradeNumber ?? "—"}</span><span>{row.phase}</span><span>{row.propResultInCents === null ? "—" : money(row.propResultInCents)}</span><span>{row.brokerResultInCents === null ? "—" : money(row.brokerResultInCents)}</span><strong>{money(row.accumulatedInCents)}</strong><span>{row.concept}</span>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

export function AccountsOverview({ accounts, entries, payouts, wallets, withdrawals }: Props) {
  const [filter, setFilter] = useState<AccountFilter>("all");
  const [closedLimit, setClosedLimit] = useState(8);
  const items = useMemo(
    () => accounts
      .map((account) => presentation(account, entries, payouts, withdrawals))
      .sort((left, right) =>
        right.account.periodMonth.localeCompare(left.account.periodMonth) ||
        left.account.companyName.localeCompare(right.account.companyName, "es") ||
        right.account.referenceNumber - left.account.referenceNumber,
      ),
    [accounts, entries, payouts, withdrawals],
  );
  const counts: Record<AccountFilter, number> = {
    active: items.filter((item) => item.account.state === "live").length,
    all: items.length,
    closed: items.filter((item) => item.account.state === "closed").length,
    evaluation: items.filter((item) => item.operationalState === "Evaluation").length,
    funded: items.filter((item) => item.operationalState === "Funded").length,
    "operational-live": items.filter((item) => item.operationalState === "Live").length,
  };
  const visible = items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "active") return item.account.state === "live";
    if (filter === "closed") return item.account.state === "closed";
    if (filter === "operational-live") return item.operationalState === "Live";
    return item.operationalState.toLowerCase() === filter;
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
        <article><span>Vivas</span><strong>{counts.active}</strong></article>
        <article><span>Vírgenes</span><strong>{items.filter((item) => item.account.state === "virgin").length}</strong></article>
        <article><span>Invertido</span><strong>{money(invested)}</strong></article>
      </div>

      <div className="demo-filter-row" aria-label="Filtrar cuentas">
        {([
          ["all", "Todas"], ["active", "Vivas"], ["evaluation", "Evaluation"],
          ["funded", "Funded"], ["operational-live", "Live"], ["closed", "Cerradas"],
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
            {active.map((item) => <AccountCard item={item} key={item.account.id} wallets={wallets} />)}
          </div>
        </div>
      )}

      {virgin.length > 0 && (
        <div className="demo-account-group">
          <div className="demo-group-title"><h3>Sin operar</h3><span>{virgin.length}</span></div>
          <div className="demo-account-list">
            {virgin.map((item) => <AccountCard item={item} key={item.account.id} wallets={wallets} />)}
          </div>
        </div>
      )}

      {closed.length > 0 && (
        <details className="demo-closed-group" open={filter === "closed"}>
          <summary><span>Cuentas cerradas</span><strong>{closed.length} · {closedPeriodCount} {closedPeriodCount === 1 ? "período" : "períodos"}</strong><i aria-hidden="true" /></summary>
          <div className="demo-account-list">
            {closed.slice(0, closedLimit).map((item) => <AccountCard item={item} key={item.account.id} wallets={wallets} />)}
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
